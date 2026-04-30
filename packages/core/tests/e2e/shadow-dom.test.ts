import "../setup";
import { describe, expect, it } from "vitest";
import { Replayer } from "../../src/core/replayer";
import type { FormScript } from "../../src/core/schema";
import { extractSelectors, resolveElement } from "../../src/core/selector";

function createV2Script(steps: FormScript["steps"]): FormScript {
  return {
    version: 2,
    id: "test-shadow",
    name: "Shadow Test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    origin: "https://example.com",
    steps,
  };
}

describe("shadow dom e2e", () => {
  it("resolves open shadow root elements", () => {
    document.body.innerHTML = "";

    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    input.id = "shadow-email";
    shadow.append(input);
    document.body.append(host);

    const selector = extractSelectors(input);

    expect(resolveElement(selector)).toBe(input);
  });

  it("replays input action into open shadow root", async () => {
    document.body.innerHTML = "";

    const host = document.createElement("div");
    host.id = "host";
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    input.id = "shadow-replay";
    input.name = "shadowField";
    shadow.append(input);
    document.body.append(host);

    const script = createV2Script([
      {
        type: "input",
        selector: { kind: "name", value: "shadowField" },
        value: "inside-shadow",
        timestamp: 0,
      },
    ]);

    await new Replayer({ script }).play();

    expect(input.value).toBe("inside-shadow");
  });
});
