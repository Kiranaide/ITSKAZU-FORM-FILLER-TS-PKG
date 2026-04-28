import "../setup";
import { describe, expect, it } from "vitest";
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
});
