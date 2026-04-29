import { serializeScript } from "../../src/core/serializer";

const payload = {
  version: 2 as const,
  id: "fixture",
  name: "fixture",
  createdAt: 0,
  updatedAt: 0,
  origin: "https://example.test",
  steps: [],
};

export const serialized = serializeScript(payload, false);
