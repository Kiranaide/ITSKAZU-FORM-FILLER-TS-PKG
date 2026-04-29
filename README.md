# Kazu-Fira (Filler)

[![npm version](https://img.shields.io/npm/v/kazu-fira)](https://www.npmjs.com/package/kazu-fira)
[![CI](https://github.com/Kiranaide/Kazu-Fira/actions/workflows/release.yml/badge.svg)](https://github.com/Kiranaide/Kazu-Fira/actions)
[![MIT license](https://img.shields.io/npm/l/kazu-fira)](LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/kazu-fira)](https://bundlephobia.com/package/kazu-fira)

Framework-agnostic form recorder/replayer for browser apps.

## Why Kazu-Fira?

Testing forms is hard. Most solutions either require expensive enterprise tools, invasive injected scripts, or produce brittle tests that break on UI changes. Kazu-Fira records real user interactions as portable scripts you can replay, inspect, or migrate — no locked-in dependencies.

## Use cases

- **QA automation** — replay recorded flows to verify form behavior
- **Regression testing** — re-run critical form journeys on every release
- **Accessibility auditing** — replay scripts to test a11y tooling
- **Integration test helpers** — generate test data from real user flows
- **Form UX research** — compare real user flows across UI iterations

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
- `validateScript`
- `createAssertStep`, `AssertionError`
- `exportToPlaywright` via `kazu-fira/adapters`
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

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.
