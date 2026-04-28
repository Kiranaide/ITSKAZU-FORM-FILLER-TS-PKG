import "../setup";
import { describe, expect, it } from "vitest";
import { deserializeScript, serializeScript } from "../../src/core/serializer";

describe("serializer", () => {
  it("roundtrips script payload", () => {
    const raw = {
      version: 2 as const,
      id: "script-1",
      name: "Roundtrip",
      createdAt: 1,
      updatedAt: 2,
      origin: "https://example.test",
      steps: [],
    };

    const serialized = serializeScript(raw);
    const deserialized = deserializeScript(serialized);
    expect(deserialized).toEqual(raw);
  });

  it("throws clear error on malformed json", () => {
    expect(() => deserializeScript("{not-json}")).toThrow(/Invalid script JSON/);
  });
});
