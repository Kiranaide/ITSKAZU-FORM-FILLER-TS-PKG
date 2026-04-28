import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(currentDir, "..");
const distDir = resolve(appDir, "dist-ext");
const zipPath = resolve(distDir, "kazu-fira-ext.zip");

async function run(command, args, cwd = appDir) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }
      rejectPromise(new Error(`${command} exited with code ${code ?? -1}`));
    });
  });
}

try {
  await access(distDir, constants.F_OK);
} catch {
  throw new Error("dist-ext directory not found. Run build:ext first.");
}

await rm(zipPath, { force: true });

if (process.platform === "win32") {
  await run("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path "${distDir}\\*" -DestinationPath "${zipPath}" -Force`,
  ]);
} else {
  await run("zip", ["-r", zipPath, "."], distDir);
}
