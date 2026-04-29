import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDir = await mkdtemp(join(tmpdir(), "kazu-fira-tree-shake-"));

try {
  const fixturePath = join(
    process.cwd(),
    "packages/core/tests/integration/tree-shake-fixture.ts",
  );
  const outFile = join(tempDir, "tree-shake-fixture.js");

  await Bun.build({
    entrypoints: [fixturePath],
    format: "esm",
    target: "browser",
    minify: true,
    sourcemap: "none",
    outdir: tempDir,
  });

  const bundle = await readFile(outFile, "utf8");
  const forbiddenMarkers = ["class Recorder", "class Replayer", "onRecordStart"];
  const leaked = forbiddenMarkers.filter((marker) => bundle.includes(marker));

  if (leaked.length > 0) {
    throw new Error(`Tree-shake smoke failed: found ${leaked.join(", ")} in bundle output`);
  }

  await writeFile(join(tempDir, "ok.txt"), "tree-shake smoke passed\n", "utf8");
  console.log("tree-shake smoke passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
