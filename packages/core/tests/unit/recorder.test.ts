import "../setup";
import { describe, expect, it } from "vitest";
import { Recorder } from "../../src/core/recorder";

describe("recorder", () => {
  it("captures input and checkbox changes", () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "email";
    input.value = "";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "tos";

    form.append(input, checkbox);
    document.body.append(form);

    const recorder = new Recorder({ root: document.body });
    recorder.start();

    input.value = "user@example.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    const script = recorder.stop();
    const actions = script.actions ?? [];

    expect(actions).toHaveLength(2);
    expect(actions[0]?.type).toBe("input");
    expect(actions[0]?.value).toBe("user@example.com");
    expect(actions[1]?.type).toBe("checkbox");
    expect(actions[1]?.value).toBe(true);
  });

  it("captures password values and respects ignore selectors", () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");

    const password = document.createElement("input");
    password.type = "password";
    password.name = "password";

    const ignored = document.createElement("input");
    ignored.name = "ignore-me";
    ignored.className = "skip";

    form.append(password, ignored);
    document.body.append(form);

    const recorder = new Recorder({ root: document.body, ignore: [".skip"] });
    recorder.start();

    password.value = "local-only-secret";
    password.dispatchEvent(new Event("input", { bubbles: true }));

    ignored.value = "should-not-record";
    ignored.dispatchEvent(new Event("input", { bubbles: true }));

    const script = recorder.stop();
    const actions = script.actions ?? [];

    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("input");
    expect(actions[0]?.value).toBe("local-only-secret");
  });

  it("captures select and radio changes", () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");

    const select = document.createElement("select");
    select.name = "country";
    select.innerHTML =
      '<option value="id">ID</option><option value="us">US</option>';

    const radioA = document.createElement("input");
    radioA.type = "radio";
    radioA.name = "plan";
    radioA.value = "basic";

    const radioB = document.createElement("input");
    radioB.type = "radio";
    radioB.name = "plan";
    radioB.value = "pro";

    form.append(select, radioA, radioB);
    document.body.append(form);

    const recorder = new Recorder({ root: document.body });
    recorder.start();

    select.value = "us";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    radioB.checked = true;
    radioB.dispatchEvent(new Event("change", { bubbles: true }));

    const script = recorder.stop();
    const actions = script.actions ?? [];

    expect(actions).toHaveLength(2);
    expect(actions[0]?.type).toBe("select");
    expect(actions[0]?.value).toBe("us");
    expect(actions[1]?.type).toBe("radio");
    expect(actions[1]?.value).toBe("pro");
  });

  it("captures focus, blur, click, and submit in order", () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "email";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Save";

    form.append(input, button);
    document.body.append(form);

    const recorder = new Recorder({ root: document.body, captureDelay: false });
    recorder.start();

    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    const script = recorder.stop();
    const actions = script.actions ?? [];

    expect(actions.map((action) => action.type)).toEqual([
      "focus",
      "blur",
      "click",
      "submit",
    ]);
    expect(actions.every((action) => action.delay === 0)).toBe(true);
  });

  it("captures keyboard navigation keys", () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "email";
    document.body.append(input);

    const recorder = new Recorder({ root: document.body });
    recorder.start();

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );

    const script = recorder.stop();
    const actions = script.actions ?? [];

    expect(actions).toHaveLength(2);
    expect(actions[0]?.type).toBe("keyboard");
    expect(actions[0]?.value).toBe("Enter");
    expect(actions[1]?.type).toBe("keyboard");
    expect(actions[1]?.value).toBe("Tab");
  });

  it("captures click interactions for combobox options", () => {
    document.body.innerHTML = "";
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    option.setAttribute("aria-label", "Facility class option");
    document.body.append(option);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const script = recorder.stop();
    const steps = script.steps ?? [];

    expect(steps).toHaveLength(1);
    expect(steps[0]?.type).toBe("click");
    expect(script.actions?.[0]?.type).toBe("click");
  });

  it("captures react-select control click via combobox input target", () => {
    document.body.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "css-ud4ew7-control";
    const input = document.createElement("input");
    input.id = "react-select-2-input";
    input.type = "text";
    input.setAttribute("role", "combobox");
    wrapper.append(input);
    document.body.append(wrapper);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    wrapper.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const script = recorder.stop();
    const steps = script.steps ?? [];

    expect(steps).toHaveLength(1);
    const step = steps[0];
    expect(step?.type).toBe("click");
    if (!step || step.type !== "click") {
      throw new Error("Expected click step");
    }
    expect(step.selector.kind).not.toBe("id");
  });

  it("captures multi-select as string array", () => {
    document.body.innerHTML = "";

    const select = document.createElement("select");
    select.name = "roles";
    select.multiple = true;
    select.innerHTML =
      '<option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>';
    document.body.append(select);

    const recorder = new Recorder({ root: document.body });
    recorder.start();

    const adminOption = select.options[0];
    const viewerOption = select.options[2];
    if (!adminOption || !viewerOption) {
      throw new Error("Expected multi-select options");
    }
    adminOption.selected = true;
    viewerOption.selected = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const script = recorder.stop();
    const actions = script.actions ?? [];

    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("select");
    expect(actions[0]?.value).toEqual(["admin", "viewer"]);
  });

  it("keeps action log even when onStep drops mapped step", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.name = "email";
    document.body.append(input);

    const recorder = new Recorder({
      root: document.body,
      hooks: {
        onStep: () => null,
      },
    });
    recorder.start();
    input.value = "drop-step";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const script = recorder.stop();

    expect(script.actions?.length).toBe(1);
    expect(script.steps?.length).toBe(0);
  });

  it("coalesces rapid consecutive input events on same field", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.name = "amount";
    document.body.append(input);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    input.value = "5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "50";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "500";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const script = recorder.stop();

    expect(script.actions?.length).toBe(1);
    expect(script.actions?.[0]?.value).toBe("500");
    expect(script.steps?.length).toBe(1);
    expect(script.steps?.[0]?.type).toBe("input");
    if (script.steps?.[0]?.type === "input") {
      expect(script.steps[0].value).toBe("500");
    }
  });

  it("coalesces input and blur-triggered change across Tab keypress", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.name = "userName";
    document.body.append(input);

    const recorder = new Recorder({ root: document.body });
    recorder.start();

    input.value = "testing_user";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const script = recorder.stop();

    expect(script.actions?.map((action) => action.type)).toEqual([
      "input",
      "keyboard",
    ]);
    expect(script.actions?.[0]?.value).toBe("testing_user");
    expect(script.steps?.map((step) => step.type)).toEqual([
      "input",
      "keyboard",
    ]);
    if (script.steps?.[0]?.type === "input") {
      expect(script.steps[0].value).toBe("testing_user");
      expect(["tab", "change"]).toContain(script.steps[0].metadata?.commitReason);
    }
  });

  it("captures react-select option as semantic select step", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "react-select-10-input";
    input.setAttribute("role", "combobox");
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    option.setAttribute("data-value", "agency");
    option.textContent = "Agency Banking";
    document.body.append(input, option);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const script = recorder.stop();

    const selectStep = script.steps?.find((step) => step.type === "select");
    expect(selectStep?.type).toBe("select");
    if (selectStep?.type === "select") {
      expect(selectStep.value).toBe("agency");
      expect(selectStep.metadata?.controlType).toBe("react-select");
      expect(selectStep.metadata?.optionLabel).toBe("Agency Banking");
    }
  });

  it("does not capture unrelated role option as react-select selection", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.id = "react-select-10-input";
    input.setAttribute("role", "combobox");
    const unrelatedOption = document.createElement("div");
    unrelatedOption.setAttribute("role", "option");
    unrelatedOption.textContent = "Calendar option-like cell";
    document.body.append(input, unrelatedOption);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    unrelatedOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const script = recorder.stop();

    const selectSteps = script.steps?.filter((step) => step.type === "select") ?? [];
    expect(selectSteps).toHaveLength(0);
  });

  it("collapses react-datepicker month/year/day into semantic date input step", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "react-datepicker-ignore-onclickoutside";
    const month = document.createElement("select");
    month.className = "react-datepicker__month-select";
    month.innerHTML = '<option value="2">March</option>';
    const year = document.createElement("select");
    year.className = "react-datepicker__year-select";
    year.innerHTML = '<option value="1966">1966</option>';
    const day = document.createElement("div");
    day.setAttribute("aria-label", "Choose Wednesday, March 9th, 1966");
    document.body.append(input, month, year, day);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    month.value = "2";
    month.dispatchEvent(new Event("change", { bubbles: true }));
    year.value = "1966";
    year.dispatchEvent(new Event("change", { bubbles: true }));
    input.value = "03/09/1966";
    day.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const script = recorder.stop();

    expect(script.steps?.some((step) => step.type === "select")).toBe(false);
    const dateStep = script.steps?.find((step) => step.type === "input");
    expect(dateStep?.type).toBe("input");
    if (dateStep?.type === "input") {
      expect(dateStep.metadata?.controlType).toBe("datepicker");
      expect(dateStep.metadata?.commitReason).toBe("calendar-day");
      expect(dateStep.metadata?.normalizedValue).toBe("1966-03-09");
      expect(dateStep.value).toBe("03/09/1966");
    }
  });

  it("collapses react-datepicker day when aria-label doesn't start with Choose", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "react-datepicker-ignore-onclickoutside";

    const day = document.createElement("div");
    day.setAttribute("aria-label", "Thursday, April 30th, 2026");

    document.body.append(input, day);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    day.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const script = recorder.stop();
    const dateStep = script.steps?.find((step) => step.type === "input");
    expect(dateStep?.type).toBe("input");
    if (dateStep?.type === "input") {
      expect(dateStep.metadata?.controlType).toBe("datepicker");
      expect(dateStep.metadata?.commitReason).toBe("calendar-day");
      expect(dateStep.metadata?.normalizedValue).toBe("2026-04-30");
      expect(dateStep.value).toBe("04/30/2026");
    }
  });

  it("captures datepicker input commit without calendar day click", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "react-datepicker-ignore-onclickoutside";
    document.body.append(input);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    input.value = "03/09/1966";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const script = recorder.stop();

    const dateStep = script.steps?.find((step) => step.type === "input");
    expect(dateStep?.type).toBe("input");
    if (dateStep?.type === "input") {
      expect(dateStep.metadata?.controlType).toBe("datepicker");
      expect(dateStep.metadata?.commitReason).toBe("change");
      expect(dateStep.value).toBe("03/09/1966");
    }
  });

  it("infers datepicker value from open picker when input stays empty", () => {
    document.body.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "react-datepicker-ignore-onclickoutside";
    const popper = document.createElement("div");
    popper.className = "react-datepicker-popper";
    const month = document.createElement("select");
    month.className = "react-datepicker__month-select";
    month.innerHTML = '<option value="2">March</option>';
    month.value = "2";
    const year = document.createElement("select");
    year.className = "react-datepicker__year-select";
    year.innerHTML = '<option value="1966">1966</option>';
    year.value = "1966";
    const day = document.createElement("div");
    day.className = "react-datepicker__day react-datepicker__day--keyboard-selected";
    day.textContent = "9";
    popper.append(month, year, day);
    document.body.append(input, popper);

    const recorder = new Recorder({ root: document.body });
    recorder.start();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const script = recorder.stop();

    const dateStep = script.steps?.find((step) => step.type === "input");
    expect(dateStep?.type).toBe("input");
    if (dateStep?.type === "input") {
      expect(dateStep.metadata?.controlType).toBe("datepicker");
      expect(dateStep.metadata?.normalizedValue).toBe("1966-03-09");
      expect(dateStep.value).toBe("03/09/1966");
    }
  });
});
