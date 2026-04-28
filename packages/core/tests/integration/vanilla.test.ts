import "../setup";
import { describe, expect, it } from "vitest";

describe("vanilla integration", () => {
  it("keeps DOM interactions runnable without framework helpers", () => {
    const button = document.createElement("button");
    button.textContent = "Save";
    document.body.append(button);

    expect(button.textContent).toBe("Save");
  });
});
