# Contributing to Kazu-Fira

## Prerequisites

- Bun >= 1.2
- Node.js >= 20

## Setup

```bash
bun install
```

## Development

```bash
bun run build
bun run test
bun run type-check
bun run lint
```

### Running a single workspace

```bash
bun --filter "./packages/core" run build
bun --filter "./apps/ext" run dev
```

## Branch Naming

- `feat/*` — new features
- `fix/*` — bug fixes
- `chore/*` — maintenance tasks

## Pull Requests

1. Fork the repo
2. Create a branch from `main`
3. Make your changes
4. Add a Changeset: `bunx changeset` and follow prompts
5. Submit a PR

We squash-merge all PRs.
Changeset files are required for any public API change (including deprecations and removals).

## Release

Only maintainers can release. Run from `main` with a clean git state:

```bash
bun run release
```