import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "kazu-fira": resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  build: {
    outDir: "dist-ext",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/extension/background.ts"),
        "content-entry": resolve(__dirname, "src/extension/content-entry.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
