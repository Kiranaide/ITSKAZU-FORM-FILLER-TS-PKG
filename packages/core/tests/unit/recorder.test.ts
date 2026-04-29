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

    const recorder = new Recorder({
      root: document.body,
      maskSensitiveInputs: false,
    });
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

  it("masks sensitive values and respects ignore selectors", () => {
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

    password.value = "secret";
    password.dispatchEvent(new Event("input", { bubbles: true }));

    ignored.value = "should-not-record";
    ignored.dispatchEvent(new Event("input", { bubbles: true }));

    const script = recorder.stop();
    const actions = script.actions ?? [];

    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("input");
    expect(actions[0]?.value).toBe("[MASKED]");
  });

  it("captures password values when sensitive masking is disabled", () => {
    document.body.innerHTML = "";
    const password = document.createElement("input");
    password.type = "password";
    password.name = "password";
    document.body.append(password);

    const recorder = new Recorder({
      root: document.body,
      maskSensitiveInputs: false,
    });
    recorder.start();

    password.value = "local-only-secret";
    password.dispatchEvent(new Event("input", { bubbles: true }));

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
    expect(step.selector).toEqual({
      kind: "id",
      value: "react-select-2-input",
    });
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
    }
  });
});
