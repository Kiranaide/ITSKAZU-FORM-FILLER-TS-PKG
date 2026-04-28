import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: [
        "src/core/migrations.ts",
        "src/core/recorder.ts",
        "src/core/replayer.ts",
        "src/core/selector.ts",
        "src/core/serializer.ts",
        "src/core/script-normalizer.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
