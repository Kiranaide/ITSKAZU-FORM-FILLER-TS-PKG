import "../setup";
import { describe, expect, it } from "vitest";
import {
  extractSelectors,
  fromSelectorStrategy,
  resolveByFormSelectorStrategy,
  resolveElement,
  selectorStrategyToQuery,
} from "../../src/core/selector";

describe("selector", () => {
  it("extracts stable selector strategies", () => {
    document.body.innerHTML = "";

    const label = document.createElement("label");
    label.htmlFor = "email";
    label.textContent = "Email";

    const input = document.createElement("input");
    input.id = "email";
    input.name = "email";

    document.body.append(label, input);

    const selector = extractSelectors(input);

    expect(selector.label).toBe("Email");
    expect(selector.strategies.map((item) => item.type)).toContain("id");
    expect(selector.strategies.map((item) => item.type)).toContain("name");
    expect(selector.source).toBe("id");
    expect(selector.confidence).toBe("high");
    expect(resolveElement(selector)).toBe(input);
  });

  it("skips unstable id strategy and falls back to aria-label", () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = ":r1:";
    input.setAttribute("aria-label", "Work Email");
    document.body.append(input);

    const selector = extractSelectors(input);
    const strategyTypes = selector.strategies.map((item) => item.type);

    expect(strategyTypes).not.toContain("id");
    expect(strategyTypes).toContain("aria-label");
    expect(selector.label).toBe("Work Email");
    expect(resolveElement(selector)).toBe(input);
  });

  it("normalizes strategy conversion helpers", () => {
    const strategy = {
      type: "data-testid" as const,
      value: '[data-testid="submit"]',
      confidence: 1,
    };
    const formSelector = fromSelectorStrategy(strategy);
    expect(formSelector).toEqual({ kind: "data", attr: "data-testid", value: "submit" });
    expect(selectorStrategyToQuery(formSelector)).toBe('[data-testid="submit"]');
  });

  it("resolves react-select dynamic id selectors with stable fallback", () => {
    document.body.innerHTML = "";
    const option = document.createElement("div");
    option.id = "react-select-9-option-1";
    document.body.append(option);

    const resolved = resolveByFormSelectorStrategy({
      kind: "id",
      value: "react-select-2-option-1",
    });
    expect(resolved).toBe(option);
  });

  it("treats react-select combobox ids as dynamic", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "react-select-2-input";
    input.setAttribute("role", "combobox");
    document.body.append(input);

    const selector = extractSelectors(input);
    expect(selector.strategies.some((strategy) => strategy.type === "id")).toBe(false);
  });

  it("resolves react-select options from menu classes by option index", () => {
    document.body.innerHTML = "";
    const menu = document.createElement("div");
    menu.className = "css-iusahdiuhawe-menu";
    const option0 = document.createElement("div");
    option0.setAttribute("role", "option");
    option0.textContent = "Option 0";
    const option1 = document.createElement("div");
    option1.setAttribute("role", "option");
    option1.textContent = "Option 1";
    menu.append(option0, option1);
    document.body.append(menu);

    const resolved = resolveByFormSelectorStrategy({
      kind: "id",
      value: "react-select-99-option-1",
    });
    expect(resolved).toBe(option1);
  });

  it("resolves react-datepicker month/year and date aria fallbacks", () => {
    document.body.innerHTML = "";
    const month = document.createElement("select");
    month.className = "react-datepicker__month-select";
    const year = document.createElement("select");
    year.className = "react-datepicker__year-select";
    const day = document.createElement("div");
    day.setAttribute("aria-label", "Choose Tuesday, August 5th, 2008");
    document.body.append(month, year, day);

    expect(
      resolveByFormSelectorStrategy({
        kind: "css",
        value: 'select[type="select-one"].react-datepicker__month-select',
      }),
    ).toBe(month);
    expect(
      resolveByFormSelectorStrategy({
        kind: "css",
        value: 'select[type="select-one"].react-datepicker__year-select',
      }),
    ).toBe(year);
    expect(
      resolveByFormSelectorStrategy({
        kind: "aria",
        value: "Choose Tuesday, August 5th, 2008",
      }),
    ).toBe(day);
  });

  it("builds unique css selector when stable classes are shared", () => {
    document.body.innerHTML = "";
    const wrapper = document.createElement("div");
    const inputA = document.createElement("input");
    inputA.type = "text";
    inputA.className = "pl-4 w-full";
    const inputB = document.createElement("input");
    inputB.type = "text";
    inputB.className = "pl-4 w-full";
    wrapper.append(inputA, inputB);
    document.body.append(wrapper);

    const selectorA = extractSelectors(inputA).strategies.find(
      (item) => item.type === "css",
    )?.value;
    const selectorB = extractSelectors(inputB).strategies.find(
      (item) => item.type === "css",
    )?.value;
    expect(selectorA).toBeTruthy();
    expect(selectorB).toBeTruthy();
    expect(selectorA).not.toEqual(selectorB);
    expect(document.querySelector(selectorA ?? "")).toBe(inputA);
    expect(document.querySelector(selectorB ?? "")).toBe(inputB);
  });

  it("prefers placeholder and aria-describedby selector strategies when present", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("placeholder", "Approved limit");
    input.setAttribute("aria-describedby", "approved-limit-help");
    document.body.append(input);

    const selector = extractSelectors(input);
    const values = selector.strategies.map((item) => item.value);
    expect(values.some((value) => value.startsWith('[placeholder="'))).toBe(true);
    expect(selector.strategies.some((item) => item.source === "placeholder")).toBe(true);
    expect(
      values.some((value) => value.startsWith('[aria-describedby="approved-limit-help"')),
    ).toBe(true);
    expect(resolveElement(selector)).toBe(input);
  });

  it("skips placeholder selector when placeholder is not unique", () => {
    document.body.innerHTML = "";
    const inputA = document.createElement("input");
    inputA.type = "text";
    inputA.setAttribute("placeholder", "Enter a number...");
    const inputB = document.createElement("input");
    inputB.type = "text";
    inputB.setAttribute("placeholder", "Enter a number...");
    document.body.append(inputA, inputB);

    const selectorA = extractSelectors(inputA);
    const placeholderStrategy = selectorA.strategies.find(
      (strategy) => strategy.value === '[placeholder="Enter a number..."]',
    );
    expect(placeholderStrategy).toBeUndefined();
    expect(selectorA.strategies[0]?.type).toBe("css");
    expect(resolveElement(selectorA)).toBe(inputA);
  });

  it("keeps readonly selector as css strategy", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("readonly", "");
    document.body.append(input);

    const selector = extractSelectors(input);
    const readonlyStrategy = selector.strategies.find((item) => item.value === "[readonly]");
    expect(readonlyStrategy?.type).toBe("css");
    expect(resolveElement(selector)).toBe(input);
  });

  it("does not use readonly selector when multiple readonly inputs exist", () => {
    document.body.innerHTML = "";
    const inputA = document.createElement("input");
    inputA.type = "text";
    inputA.setAttribute("readonly", "");
    const inputB = document.createElement("input");
    inputB.type = "text";
    inputB.setAttribute("readonly", "");
    document.body.append(inputA, inputB);

    const selector = extractSelectors(inputA);
    const readonlyStrategy = selector.strategies.find((item) => item.value === "[readonly]");
    expect(readonlyStrategy).toBeUndefined();
  });

  it("uses data-value selector when present", () => {
    document.body.innerHTML = "";

    const option = document.createElement("div");
    option.setAttribute("role", "option");
    option.setAttribute("data-value", "June");
    document.body.append(option);

    const selector = extractSelectors(option);
    const values = selector.strategies.map((s) => s.value);
    expect(values).toContain('[data-value="June"]');
    expect(resolveElement(selector)).toBe(option);
  });
});
