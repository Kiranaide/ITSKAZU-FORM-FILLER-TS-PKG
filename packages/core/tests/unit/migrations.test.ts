import { describe, expect, it } from "vitest";
import { validateScript } from "../../src/core/migrations";

describe("validateScript", () => {
  it("should accept valid v2 scripts", () => {
    const v2Script = {
      version: 2,
      id: "test-1",
      name: "Test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      origin: "https://example.com",
      steps: [],
    };
    const result = validateScript(v2Script);
    expect(result.version).toBe(2);
    expect(result.id).toBe("test-1");
    expect(result.name).toBe("Test");
    expect(result.steps).toEqual([]);
  });

  it("should throw on invalid versions", () => {
    const invalid = { version: 99, name: "Invalid" };
    expect(() => validateScript(invalid)).toThrow("Unsupported script version");
  });

  it("should throw when no version provided", () => {
    const noVersion = { name: "No version" };
    expect(() => validateScript(noVersion)).toThrow("Unsupported script");
  });
});
