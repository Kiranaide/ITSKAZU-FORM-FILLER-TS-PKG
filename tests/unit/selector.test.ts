import "../setup";
import { describe, expect, it } from "vitest";
import { extractSelectors, resolveElement } from "../../src/core/selector";

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
    expect(resolveElement(selector)).toBe(input);
  });
});
