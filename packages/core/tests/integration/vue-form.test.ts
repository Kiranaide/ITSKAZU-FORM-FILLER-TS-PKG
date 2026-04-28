import "../setup";
import { describe, expect, it } from "vitest";

describe("vue integration", () => {
  it("supports label-based selector generation", () => {
    const label = document.createElement("label");
    label.htmlFor = "name";
    label.textContent = "Name";
    const input = document.createElement("input");
    input.id = "name";
    document.body.append(label, input);

    expect(document.querySelector('label[for="name"]')?.textContent).toBe("Name");
  });
});
