import "../setup";
import { describe, expect, it } from "vitest";
import { migrateScript } from "../../src/core/migrations";

describe("migrateScript", () => {
  it("converts v1 shape to v2", () => {
    const migrated = migrateScript({
      id: "x1",
      name: "legacy",
      version: 1,
      steps: [],
    });

    expect(migrated.version).toBe(2);
    expect(migrated.id).toBe("x1");
    expect(Array.isArray(migrated.steps)).toBe(true);
  });

  it("normalizes v2 script shape", () => {
    const script = {
      version: 2 as const,
      id: "v2",
      name: "new",
      createdAt: 1,
      updatedAt: 2,
      origin: "https://example.com",
      steps: [],
    };

    expect(migrateScript(script)).toEqual(script);
  });

  it("handles missing fields safely", () => {
    const migrated = migrateScript({});
    expect(migrated.version).toBe(2);
    expect(typeof migrated.name).toBe("string");
    expect(typeof migrated.id).toBe("string");
  });
});
