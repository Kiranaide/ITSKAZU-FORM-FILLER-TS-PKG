import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
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
  },
  {
    entry: { cli: "src/cli/index.ts", "__toolbox/client": "src/cli/client.ts" },
    format: ["esm"],
    platform: "node",
    target: "es2022",
    external: ["hono"],
    outDir: "dist",
    outExtension() {
      return { js: ".mjs" };
    },
    esbuildOptions(options) {
      options.platform = "node";
    },
  },
  {
    entry: { "__toolbox/client": "src/cli/client.ts" },
    format: ["iife"],
    target: "es2022",
    globalName: "ItskazuToolboxClient",
    outDir: "dist",
    outExtension() {
      return { js: ".js" };
    },
  },
]);
