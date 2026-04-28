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
});
