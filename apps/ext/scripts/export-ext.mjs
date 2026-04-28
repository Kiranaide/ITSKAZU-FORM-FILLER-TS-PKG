import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(currentDir, "..");
const distDir = resolve(appDir, "dist-ext");
const manifestSource = resolve(appDir, "manifest.json");
const manifestTarget = resolve(distDir, "manifest.json");

await mkdir(distDir, { recursive: true });
await cp(manifestSource, manifestTarget, { force: true });
