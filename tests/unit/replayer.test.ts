import "../setup";
import { describe, expect, it } from "vitest";
import { Replayer } from "../../src/core/replayer";

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
});
