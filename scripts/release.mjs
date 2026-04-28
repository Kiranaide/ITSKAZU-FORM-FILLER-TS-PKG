import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const run = (command, options = {}) => {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", cwd: process.cwd(), ...options });
};

const read = (command) =>
  execSync(command, { encoding: "utf8", cwd: process.cwd() }).trim();

const fail = (message) => {
  console.error(`\nRelease failed: ${message}`);
  process.exit(1);
};

const getVersion = (relativePath) => {
  const absolutePath = resolve(process.cwd(), relativePath);
  const packageJson = JSON.parse(readFileSync(absolutePath, "utf8"));

  if (
    typeof packageJson.version !== "string" ||
    packageJson.version.length === 0
  ) {
    throw new Error(`Missing valid version in ${relativePath}`);
  }

  return packageJson.version;
};

const parseReleaseType = (argv) => {
  const value = argv[2];
  if (!value) {
    return null;
  }

  if (!["hotfix", "minor", "major"].includes(value)) {
    fail(`invalid release type '${value}'. Use hotfix, minor, or major.`);
  }

  return value;
};

const createChangesetForReleaseType = (releaseType) => {
  if (!releaseType) {
    return;
  }

  const bumpTypeMap = {
    hotfix: "patch",
    minor: "minor",
    major: "major",
  };

  const bumpType = bumpTypeMap[releaseType];
  const changesetDir = resolve(process.cwd(), ".changeset");
  const filename = `auto-release-${Date.now()}.md`;
  const filepath = resolve(changesetDir, filename);
  const content = `---
"kazu-fira": ${bumpType}
---

Automated ${releaseType} release.
`;

  mkdirSync(changesetDir, { recursive: true });
  writeFileSync(filepath, content, "utf8");
  console.log(`Created automatic changeset: .changeset/${filename}`);
};

const ensureCleanGitTree = () => {
  const status = read("git status --porcelain");
  if (status.length > 0) {
    fail(
      "working tree is not clean. Commit or stash existing changes before releasing.",
    );
  }
};

const ensureMasterBranch = () => {
  const branch = read("git rev-parse --abbrev-ref HEAD");
  if (branch !== "master") {
    fail(`release must run from 'master', current branch is '${branch}'.`);
  }
};

const ensureReleaseChangesExist = () => {
  try {
    run("git diff --cached --quiet");
    fail(
      "no release changes were generated. Add a changeset before releasing.",
    );
  } catch {
    // Non-zero exit code means staged changes exist, which is expected.
  }
};

ensureCleanGitTree();
ensureMasterBranch();
const releaseType = parseReleaseType(process.argv);
createChangesetForReleaseType(releaseType);
run("bun run type-check");
run("bun run test");
run("bun run build");
run("bun run release:version");
run("bun install");

const version = getVersion("packages/core/package.json");

run("git add -A");
ensureReleaseChangesExist();
run(`git commit -m "chore(release): v${version}"`);
run("bun run release:publish");
run("git push --follow-tags");
