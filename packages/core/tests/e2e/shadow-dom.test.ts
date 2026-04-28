import "../setup";
import { describe, expect, it } from "vitest";
import { Replayer } from "../../src/core/replayer";
import { extractSelectors, resolveElement } from "../../src/core/selector";

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
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    input.id = "shadow-replay";
    shadow.append(input);
    document.body.append(host);

    const selector = extractSelectors(input);
    const script = {
      version: "1" as const,
      name: "shadow-replay",
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      actions: [
        {
          id: "1",
          type: "input" as const,
          selector,
          value: "inside-shadow",
          timestamp: 0,
          delay: 0,
        },
      ],
    };

    await new Replayer({ script }).play();

    expect(input.value).toBe("inside-shadow");
  });
});
