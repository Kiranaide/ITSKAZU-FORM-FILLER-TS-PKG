import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(currentDir, "..");
const distDir = resolve(appDir, "dist-ext");
const manifestSource = resolve(appDir, "manifest.json");
const packageJsonPath = resolve(appDir, "package.json");
const manifestTarget = resolve(distDir, "manifest.json");

await mkdir(distDir, { recursive: true });

const [manifestRaw, packageRaw] = await Promise.all([
  readFile(manifestSource, "utf8"),
  readFile(packageJsonPath, "utf8"),
]);

const manifest = JSON.parse(manifestRaw);
const packageJson = JSON.parse(packageRaw);

if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
  manifest.version = packageJson.version;
}

await writeFile(manifestTarget, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
