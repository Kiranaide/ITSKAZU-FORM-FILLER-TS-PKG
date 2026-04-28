import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./packages/core/tests/e2e",
  testMatch: "**/*.spec.ts",
  use: {
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "bunx serve examples -p 4321",
    port: 4321,
    reuseExistingServer: true,
  },
});
