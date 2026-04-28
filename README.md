# ItsKazu-Form-Filler

Framework-agnostic form recorder/replayer for browser apps, with optional dev toolbar + proxy CLI.

## Current status

- Package scaffold exists (`src`, `tests`, `tsup`, `dist`).
- Core recorder/replayer + selector strategy implemented.
- Shadow DOM + SPA adapters implemented.
- Toolbar + CLI/proxy tooling implemented.
- Tests exist for unit, integration, and Shadow DOM e2e-style coverage.

## Install

```bash
bun install
```

## Build and test

```bash
bun run build
bun run type-check
bun test
```

## Package outputs

- ESM: `dist/index.mjs`
- CJS: `dist/index.cjs`
- Types: `dist/index.d.ts`
- Browser global (IIFE): `dist/index.js` (`ItskazuFormFiller`)
- CLI: `dist/cli.mjs` (bin: `itskazu-form-filler`)

## Public API

From `src/index.ts`:

- `Recorder`
- `Replayer`
- `serializeScript`, `deserializeScript`
- `saveScript`, `loadAllScripts`, `exportScript`, `deleteScript`
- `watchNavigation` (SPA adapter)
- `watchOpenShadowRoots` (Shadow DOM adapter)
- `mountToolbar`
- `init({ toolbar?: boolean })`

## Quick usage

```ts
import { Recorder, Replayer } from "itskazu-form-filler";

const recorder = new Recorder();
recorder.start();

// ...user interacts with form...

const script = recorder.stop();

const replayer = new Replayer({ script, highlight: true });
await replayer.play();
```

## CLI proxy usage

Inject toolbar client into running dev app via local proxy:

```bash
npx itskazu-form-filler 5173
# or
npx itskazu-form-filler -a 5173 -p 3100
```

Useful flags:

- `-a, --app-port <port>` target app port
- `-u, --url <url>` target app URL
- `-p, --port <port>` toolbar/proxy port (default `3100`)
- `-w, --workspace <path>` workspace path
- `--host <host>` script host for remote/container setups
- `-v, --verbose` debug logs

## Technical behavior

- Capture listeners use `capture: true` for framework compatibility.
- Selector extraction uses confidence-ordered multi-strategy fallback (`id`, `name`, data attrs, `aria-label`, CSS).
- Replay input writes use native input/textarea value setter + `input`/`change` dispatch.
- Shadow DOM traversal supported for record and replay resolution.

## Privacy baseline

- Sensitive inputs masked by default (`password`, common card autofill attrs).
- Extra masking via `mask` selectors.
- Exclusion via `ignore` selectors.
- Core flow has no telemetry/network side effects.

## Project layout

```text
src/
  core/        # recorder, replayer, selector, serializer, storage, types
  adapters/    # shadow-dom, spa-router
  overlay/     # toolbar, indicator, styles, log-panel
  cli/         # proxy server, injector, ws client, message bus
  utils/       # dom, timing, nanoid
tests/
  unit/
  integration/
  e2e/
```

## Notes

- Package intent remains library-first.
- Current `ws` dependency used for CLI/dev tooling path.
