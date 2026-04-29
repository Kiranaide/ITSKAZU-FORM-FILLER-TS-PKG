import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/adapters/index.ts"],
  tsconfig: "./tsconfig.build.json",
  format: ["cjs", "esm", "iife"],
  dts: true,
  treeshake: true,
  minify: true,
  target: "es2022",
  globalName: "KazuFira",
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : format === "iife" ? ".js" : ".mjs" };
  },
  esbuildOptions(options) {
    options.drop = ["console", "debugger"];
  },
});
