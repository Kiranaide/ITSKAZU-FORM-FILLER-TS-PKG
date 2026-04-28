import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();

const packagePaths = {
  root: resolve(rootDir, "package.json"),
  core: resolve(rootDir, "packages/core/package.json"),
  ext: resolve(rootDir, "apps/ext/package.json"),
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const writeJson = (path, json) => {
  const formatted = `${JSON.stringify(json, null, 2)}\n`;
  writeFileSync(path, formatted, "utf8");
};

const corePackage = readJson(packagePaths.core);
const targetVersion = corePackage.version;

if (typeof targetVersion !== "string" || targetVersion.length === 0) {
  throw new Error("packages/core/package.json is missing a valid version.");
}

for (const path of [packagePaths.root, packagePaths.ext]) {
  const packageJson = readJson(path);
  packageJson.version = targetVersion;
  writeJson(path, packageJson);
}

console.log(`Synchronized root and ext versions to ${targetVersion}.`);
