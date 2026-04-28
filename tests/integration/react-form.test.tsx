import "../setup";
import { describe, expect, it } from "vitest";

describe("react integration", () => {
  it("can target controlled-form style markup", () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "email-field");
    document.body.append(input);

    expect(input.getAttribute("data-testid")).toBe("email-field");
  });
});
