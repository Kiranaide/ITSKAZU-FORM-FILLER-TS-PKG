import { describe, it, expect } from "vitest";
import { migrateScript } from "../../src/core/migrations";

describe("migrateScript", () => {
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
    const result = migrateScript(v2Script);
    expect(result.version).toBe(2);
    expect(result.id).toBe("test-1");
    expect(result.name).toBe("Test");
    expect(result.steps).toEqual([]);
  });

  it("should throw on invalid versions", () => {
    const invalid = { version: 99, name: "Invalid" };
    expect(() => migrateScript(invalid)).toThrow("Unsupported script version");
  });

  it("should throw when no version provided", () => {
    const noVersion = { name: "No version" };
    expect(() => migrateScript(noVersion)).toThrow("Unsupported script");
  });
});