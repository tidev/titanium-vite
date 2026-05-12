# Titanium <-> Vite Build Bridge Plan

## Goal

Create a reliable, typed bridge for passing data between the Titanium build and the Vite build, without relying on global environment variables.

## Principles

- Prefer explicit APIs over implicit global state.
- Keep data flow directional and versioned.
- Make handoff deterministic and testable.
- Support both same-process and cross-process execution.

## Data Flow

1. Titanium creates a bridge context (`platform`, `deployType`, `target`, `buildId`, `schemaVersion`).
2. Titanium passes that context to Vite plugin options.
3. Vite plugins collect Titanium symbol usage.
4. Vite returns build metadata through a `report()` callback.
5. Titanium validates payload (`schemaVersion`, `buildId`) and assigns `builder.tiSymbols`.
6. Optional fallback: also write/read a metadata JSON sidecar file.

## Contract (Versioned)

```ts
type TiViteContextV1 = {
  schemaVersion: 1;
  buildId: string;
  platform: string;
  deployType: string;
  target?: string;
  // IDs of native/CommonJS modules from tiapp.xml, filtered to the active
  // build platform. Vite externalizes these so Titanium's runtime resolves them.
  nativeModules: string[];
};

type TiViteResultV1 = {
  schemaVersion: 1;
  buildId: string;
  tiSymbols: Record<string, string[]>;
};
```

## Titanium Integration Plan

1. Add `createTiViteBridge()` helper in CLI code.
2. Generate a unique `buildId` for each build.
3. Build a `context` object and pass it into Vite plugin config.
4. Pass a `report(result)` callback into the plugin.
5. After Vite build completes:
   - Validate `schemaVersion`.
   - Validate `buildId` matches current build.
   - Assign `builder.tiSymbols = result.tiSymbols`.
6. If no in-memory result exists, fallback to reading sidecar JSON.

## Vite Plugin Integration Plan

1. Add a dedicated plugin (for example `ti-bridge-plugin`).
2. Accept `{ context, report }` in plugin options.
3. Use `context.platform` directly in plugin logic.
4. Collect API usage during transform/generate/close hooks.
5. Emit final payload in `closeBundle()` via `report(...)`.
6. Optionally write `ti-build-meta.json` for cross-process fallback.

## Sidecar File (Optional, Recommended as Fallback)

- Path: `<buildDir>/vite/ti-build-meta.json`
- Write atomically:
  1. write `<file>.tmp`
  2. rename to final path
- Include:
  - `schemaVersion`
  - `buildId`
  - `tiSymbols`
- Titanium must reject payload if schema/buildId mismatch.

## Migration Steps from Env Vars

1. Keep existing env var support temporarily for compatibility.
2. Prefer bridge context in plugin when available.
3. Add warning when plugin had to read env var fallback.
4. Remove env var dependency after migration is stable.

## Validation Checklist

1. Build iOS and Android back-to-back: verify platform-specific behavior uses context, not stale globals.
2. Run two consecutive builds: verify `buildId` changes and old payload is never reused.
3. Force plugin to emit symbols: verify `builder.tiSymbols` is populated.
4. Simulate mismatch (`buildId` or schema): verify Titanium rejects payload clearly.
5. Run watch/incremental builds: verify symbols update correctly on each cycle.
6. Run with sidecar-only mode: verify Titanium can recover symbols from JSON fallback.

## Suggested Error Messages

- `Invalid Vite bridge schema version: expected 1, received X`
- `Stale Vite bridge payload: buildId mismatch`
- `Missing Vite bridge result: no report callback payload and no sidecar file`

## Minimal Pseudocode

```js
const bridge = createTiViteBridge({
  schemaVersion: 1,
  buildId: randomUUID(),
  platform: builder.platform,
  deployType: builder.deployType,
  target: builder.target
});

await viteBuilder.buildApp({
  plugins: [
    tiBridgePlugin({
      context: bridge.context,
      report: bridge.report
    })
  ]
});

const result = await bridge.getResultOrReadSidecar();
validateResult(result, bridge.context);
builder.tiSymbols = result.tiSymbols;
```
