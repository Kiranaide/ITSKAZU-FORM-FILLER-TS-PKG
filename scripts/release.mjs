#!/usr/bin/env node

import { execSync } from "node:child_process";

function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", ...options });
}

function read(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`\nRelease failed: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { bump: "patch", noGh: false, noPush: false };
  for (const token of argv) {
    if (["patch", "minor", "major", "prerelease"].includes(token)) {
      args.bump = token;
      continue;
    }
    if (token === "--no-gh") {
      args.noGh = true;
      continue;
    }
    if (token === "--no-push") {
      args.noPush = true;
      continue;
    }
    fail(`Unknown argument: ${token}`);
  }
  return args;
}

function ensureCleanTree() {
  const status = read("git status --porcelain");
  if (status) {
    fail("working tree not clean. Commit or stash changes first.");
  }
}

function ensureOnMaster() {
  const branch = read("git rev-parse --abbrev-ref HEAD");
  if (branch !== "master") {
    fail(`current branch is '${branch}'. Switch to 'master' first.`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  ensureCleanTree();
  ensureOnMaster();

  run("bun install --frozen-lockfile");
  run("bun run type-check");
  run("bun run test");
  run("bun run build");

  const next = read(
    `npm version ${args.bump} -m "chore(release): bump version to %s"`,
  );

  if (!args.noPush) {
    run("git push --follow-tags");
  }

  run("npm publish --access public");

  if (!args.noGh) {
    run(`gh release create ${next} --generate-notes --latest`);
  }

  console.log(`\nRelease complete: ${next}`);
}

main();
