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

    expect(script.actions).toHaveLength(2);
    expect(script.actions[0].type).toBe("input");
    expect(script.actions[0].value).toBe("user@example.com");
    expect(script.actions[1].type).toBe("checkbox");
    expect(script.actions[1].value).toBe(true);
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

    expect(script.actions).toHaveLength(1);
    expect(script.actions[0].type).toBe("input");
    expect(script.actions[0].value).toBe("[masked]");
  });

  it("captures select and radio changes", () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");

    const select = document.createElement("select");
    select.name = "country";
    select.innerHTML = '<option value="id">ID</option><option value="us">US</option>';

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

    expect(script.actions).toHaveLength(2);
    expect(script.actions[0].type).toBe("select");
    expect(script.actions[0].value).toBe("us");
    expect(script.actions[1].type).toBe("radio");
    expect(script.actions[1].value).toBe("pro");
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
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const script = recorder.stop();

    expect(script.actions.map((action) => action.type)).toEqual(["focus", "blur", "click", "submit"]);
    expect(script.actions.every((action) => action.delay === 0)).toBe(true);
  });

  it("captures multi-select as string array", () => {
    document.body.innerHTML = "";

    const select = document.createElement("select");
    select.name = "roles";
    select.multiple = true;
    select.innerHTML = '<option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>';
    document.body.append(select);

    const recorder = new Recorder({ root: document.body });
    recorder.start();

    select.options[0].selected = true;
    select.options[2].selected = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const script = recorder.stop();

    expect(script.actions).toHaveLength(1);
    expect(script.actions[0].type).toBe("select");
    expect(script.actions[0].value).toEqual(["admin", "viewer"]);
  });
});
