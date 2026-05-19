# @titanium-sdk/vite-plugin-titanium-alloy

## OVERVIEW
Vite integration for Alloy — Titanium's MVC framework. Wraps `alloy-compiler` to translate `app/views`, `app/styles`, `app/controllers`, `app/models`, `app/widgets` into runnable JS. Entry: `resolveAlloyPlugins(projectDir, platform)`.

## STRUCTURE
```
src/
├── index.ts             # resolveAlloyPlugins() — composes the plugin chain
├── context.ts           # AlloyContext — owns AlloyCompiler + dev-server hooks; full-recompile triggers
├── core.ts              # alloy/* aliases, define globals (ENV_DEV, OS_MOBILEWEB, etc.), controller patching
├── config.ts            # app/config.json handling
├── entry.ts             # virtual entry
├── component.ts         # view/style/controller compilation
├── model.ts             # model adapters
├── widget.ts            # widget loading
└── alloy-compiler.d.ts  # ambient types for upstream alloy-compiler
```

## WHERE TO LOOK
| Task | File |
|------|------|
| Alias rules (`alloy/*` → real paths) | `core.ts:32` `config.resolve.alias` |
| Compile-time globals | `core.ts:77` `config.define` (ENV_DEV, ALLOY_VERSION, OS_MOBILEWEB, ...) |
| Files that force full Alloy recompile | `context.ts:10` `fullRecompileFiles` (`app/styles/app.tss`, `app/config.json`) |
| Compiler instantiation | `context.ts:79` `createCompiler` |
| Controller `require()` patching for Vite | `core.ts:138` `patchForViteCompatibility` |
| jQuery externalization (Backbone unused-import leak) | `core.ts:116` `resolveId` |

## CONVENTIONS
- All plugins receive the same `AlloyContext` instance; never instantiate `AlloyCompiler` outside it.
- Editing files in `fullRecompileFiles` rebuilds the compiler **and** invalidates Vite's module graph (`context.ts:65`); other edits use HMR.
- `alloy` package is resolved via `require.resolve` against `projectDir` (`context.ts:35`) — Alloy must be installed in the **consuming** project, not this package.
- `app/lib` does **not** support nested `node_modules`. Bare imports inside `app/lib` resolve via Vite's normal resolution (project-root `node_modules`); install dependencies at the project root.

## ANTI-PATTERNS
- `core.ts:140`: controller `.default` patching is intentionally **disabled**. Don't re-enable until per-project ESM-mode control exists (the helper `requireDefaultExport` at `:159` is the dead code path).
- `context.ts:86` `webpack: false` is hardcoded. Flipping it requires plumbing project-level config — not a one-line change.
- Backbone version falls back to `"0.9.2"` if `compileConfig.backbone` is missing (`core.ts:8`); upgrading breaks the `lib/alloy/backbone/<ver>/backbone.js` alias path.
- `ALLOY_VERSION` define is hardcoded `"1.0.0"` in `core.ts:79` — not the real Alloy version. Treat as placeholder.

## NOTES
- No tests.
- Depends on upstream `alloy-compiler` (^0.2.7) — public types are in `alloy-compiler.d.ts`.
