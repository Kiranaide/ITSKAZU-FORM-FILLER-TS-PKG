# Kazu-Fira

Framework-agnostic form recorder/replayer for browser apps, now organized as a Bun monorepo.

## Workspaces

- `packages/core`: publishable library package (`kazu-fira`)
- `apps/ext`: internal Vite 8 + React 19 extension workspace
- root: shared tooling, Changesets, CI, and workspace orchestration

## Install dependencies

```bash
bun install
```

## Workspace commands

```bash
bun run build
bun run type-check
bun run test
bun run lint
```

Run a single workspace:

```bash
bun --filter "./packages/core" run build
bun --filter "./apps/ext" run dev
```

## Core package

Published from `packages/core` as `kazu-fira`.

- `Recorder`
- `Replayer`
- `serializeScript`, `deserializeScript`
- `migrateScript`
- `applyPlugins`
- schema and type exports

### Install only the library

```bash
bun add kazu-fira
```

### Quick usage

```ts
import { Recorder, Replayer } from "kazu-fira";

const recorder = new Recorder();
recorder.start();

// ...user interacts with form...

const script = recorder.stop();

const replayer = new Replayer({ script, highlight: true });
await replayer.play();
```

## Ext app

`apps/ext` contains:

- the internal Vite 8 + React 19 shell
- newest toolbar runtime + injection client
- proxy and websocket tooling for injected toolbar runtime
- browser-side storage and session helpers

Breaking change:

- legacy toolbar/session migration paths have been removed; only `kazu-fira:sessions:v2` is supported.

Start it locally:

```bash
bun --filter "./apps/ext" run dev
```

## Project layout

```text
packages/
  core/
    src/
    tests/
apps/
  ext/
    src/
examples/
.github/
```

## Notes

- `packages/core` is intentionally decoupled from overlay and adapter implementations.
- `apps/ext` consumes `kazu-fira` through the workspace boundary during development.
- Changesets is the only release path; `apps/ext` is internal and not published.

## Release

Run releases from the repository root:

```bash
bun run release
```

What it does:

- requires clean git state on `main`
- runs quality gates (`type-check`, `test`, `build`)
- runs `changeset version`
- keeps versions aligned across root, `packages/core`, and `apps/ext`
- refreshes `bun.lock`
- commits release files and version changes
- publishes to npm via Changesets
- pushes commit + tags in one command (`git push --follow-tags`)
