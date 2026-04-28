import "../setup";
import { describe, expect, it } from "vitest";
import { Replayer } from "../../src/core/replayer";
import { resolveElement } from "../../src/core/selector";

describe("replayer", () => {
  it("fills text and checkbox inputs", async () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");
    const input = document.createElement("input");
    input.id = "email";
    input.name = "email";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "tos";

    form.append(input, checkbox);
    document.body.append(form);

    const script = {
      version: "1" as const,
      name: "demo",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "input" as const,
          selector: {
            strategies: [{ type: "id", value: "#email", confidence: 1 }],
            fieldType: "input",
          },
          value: "user@example.com",
          timestamp: 0,
          delay: 0,
        },
        {
          id: "2",
          type: "checkbox" as const,
          selector: {
            strategies: [{ type: "id", value: "#tos", confidence: 1 }],
            fieldType: "input",
          },
          value: true,
          timestamp: 1,
          delay: 0,
        },
      ],
    };

    await new Replayer({ script }).play();

    expect(input.value).toBe("user@example.com");
    expect(checkbox.checked).toBe(true);
  });

  it("handles select, radio, and submit", async () => {
    document.body.innerHTML = "";

    const form = document.createElement("form");
    const select = document.createElement("select");
    select.id = "country";
    select.innerHTML = '<option value="id">ID</option><option value="us">US</option>';

    const radioA = document.createElement("input");
    radioA.type = "radio";
    radioA.name = "plan";
    radioA.value = "basic";
    radioA.id = "plan-basic";

    const radioB = document.createElement("input");
    radioB.type = "radio";
    radioB.name = "plan";
    radioB.value = "pro";
    radioB.id = "plan-pro";

    let submitted = false;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted = true;
    });

    form.append(select, radioA, radioB);
    document.body.append(form);

    const script = {
      version: "1" as const,
      name: "demo-2",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "select" as const,
          selector: {
            strategies: [{ type: "id", value: "#country", confidence: 1 }],
            fieldType: "select",
          },
          value: "us",
          timestamp: 0,
          delay: 0,
        },
        {
          id: "2",
          type: "radio" as const,
          selector: {
            strategies: [{ type: "id", value: "#plan-basic", confidence: 1 }],
            fieldType: "input",
          },
          value: "pro",
          timestamp: 1,
          delay: 0,
        },
        {
          id: "3",
          type: "submit" as const,
          selector: {
            strategies: [{ type: "css", value: "form", confidence: 1 }],
            fieldType: "form",
          },
          timestamp: 2,
          delay: 0,
        },
      ],
    };

    await new Replayer({ script }).play();

    expect(select.value).toBe("us");
    expect(radioB.checked).toBe(true);
    expect(submitted).toBe(true);
  });

  it("handles multi-select values", async () => {
    document.body.innerHTML = "";

    const select = document.createElement("select");
    select.id = "roles";
    select.multiple = true;
    select.innerHTML = '<option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>';
    document.body.append(select);

    const script = {
      version: "1" as const,
      name: "demo-3",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "select" as const,
          selector: {
            strategies: [{ type: "id", value: "#roles", confidence: 1 }],
            fieldType: "select",
          },
          value: ["admin", "viewer"],
          timestamp: 0,
          delay: 0,
        },
      ],
    };

    await new Replayer({ script }).play();

    const selected = Array.from(select.selectedOptions, (option) => option.value);
    expect(selected).toEqual(["admin", "viewer"]);
  });

  it("aborts on missing element when onError returns abort", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "email";
    document.body.append(input);

    let errorCount = 0;

    const script = {
      version: "1" as const,
      name: "demo-4",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "input" as const,
          selector: {
            strategies: [{ type: "id", value: "#missing", confidence: 1 }],
            fieldType: "input",
          },
          value: "x",
          timestamp: 0,
          delay: 0,
        },
        {
          id: "2",
          type: "input" as const,
          selector: {
            strategies: [{ type: "id", value: "#email", confidence: 1 }],
            fieldType: "input",
          },
          value: "should-not-run",
          timestamp: 1,
          delay: 0,
        },
      ],
    };

    await new Replayer({
      script,
      onError: () => {
        errorCount += 1;
        return "abort";
      },
    }).play();

    expect(errorCount).toBe(1);
    expect(input.value).toBe("");
  });

  it("skips action when onBeforeAction returns false", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "email";
    document.body.append(input);

    const script = {
      version: "1" as const,
      name: "demo-5",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "input" as const,
          selector: {
            strategies: [{ type: "id", value: "#email", confidence: 1 }],
            fieldType: "input",
          },
          value: "skip-me",
          timestamp: 0,
          delay: 0,
        },
      ],
    };

    await new Replayer({ script, onBeforeAction: () => false }).play();

    expect(input.value).toBe("");
  });

  it("calls onAfterAction with resolved element", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "after-email";
    document.body.append(input);

    const seen: string[] = [];

    const script = {
      version: "1" as const,
      name: "demo-6",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "focus" as const,
          selector: {
            strategies: [{ type: "id", value: "#after-email", confidence: 1 }],
            fieldType: "input",
          },
          timestamp: 0,
          delay: 0,
        },
        {
          id: "2",
          type: "input" as const,
          selector: {
            strategies: [{ type: "id", value: "#after-email", confidence: 1 }],
            fieldType: "input",
          },
          value: "done",
          timestamp: 1,
          delay: 0,
        },
      ],
    };

    await new Replayer({
      script,
      onAfterAction: (_action, el) => {
        seen.push((el as HTMLInputElement).id);
      },
    }).play();

    expect(seen).toEqual(["after-email", "after-email"]);
    expect(input.value).toBe("done");
  });

  it("continues when selector strategy is invalid", async () => {
    document.body.innerHTML = "";

    const input = document.createElement("input");
    input.id = "valid-next";
    document.body.append(input);

    const script = {
      version: "1" as const,
      name: "demo-7",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "input" as const,
          selector: {
            strategies: [{ type: "css", value: "[", confidence: 1 }],
            fieldType: "input",
          },
          value: "bad",
          timestamp: 0,
          delay: 0,
        },
        {
          id: "2",
          type: "input" as const,
          selector: {
            strategies: [{ type: "id", value: "#valid-next", confidence: 1 }],
            fieldType: "input",
          },
          value: "good",
          timestamp: 1,
          delay: 0,
        },
      ],
    };

    await new Replayer({ script }).play();

    expect(resolveElement(script.actions[1].selector)).toBe(input);
    expect(input.value).toBe("good");
  });
});
