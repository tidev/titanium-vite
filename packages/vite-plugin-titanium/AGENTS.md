# @titanium-sdk/vite-plugin-titanium

## OVERVIEW
Composite Vite plugin for the Titanium SDK. `titanium({ projectType, platform })` returns an array of Vite plugins. Branches between `"classic"` and `"alloy"` project types; Alloy plugins ship from `@titanium-sdk/vite-plugin-titanium-alloy` and are not exported here.

## STRUCTURE
```
src/
├── index.ts             # titanium() entry — validates platform, composes plugins, wraps with moduleRunnerTransform
├── shared/              # plugins active for every projectType
│   ├── core.ts            # Vite config defaults + /invoke dev middleware
│   ├── module-runner.ts   # SSR/runner transform plugin
│   ├── polyfills.ts       # injects @titanium-sdk/polyfills
│   ├── node-builtins.ts   # Node built-ins shimming
│   ├── resolve.ts         # platform-aware bare/absolute id resolution
│   ├── ti-symbols.ts      # AST walk: collects Ti.*/Titanium.* usage; reports via TiBridgeApi
│   └── i18n.ts            # i18n string extraction
└── classic/             # only loaded when projectType === "classic"
    ├── index.ts           # classicPlugin() — composes virtualEntry + assets
    ├── entry.ts           # virtual app.js entry
    └── assets.ts          # copies platform assets
```

## WHERE TO LOOK
| Task | File |
|------|------|
| Add a new shared plugin | append to `sharedPlugins` array in `src/index.ts:24` |
| Modify Vite defaults | `shared/core.ts:14` `config()` (sets `build.outDir: "Resources"`, target `ios13`) |
| `/invoke` HMR endpoint (dev) | `shared/core.ts:50` `titaniumInvokeMiddleware` |
| `Ti.*` AST detection | `shared/ti-symbols.ts:43` `tiSymbolsPlugin` |
| Platform fallback resolution | `shared/resolve.ts` (FIXME at :69) |
| Module-runner chunk transform | `src/index.ts:36` `moduleRunnerTransformPlugin` |
| Alloy support | NOT here — see `packages/vite-plugin-titanium-alloy/` |

## CONVENTIONS
- Plugins are **factories** returning `Plugin` or `Plugin[]`; never inline plugin objects in `src/index.ts`.
- Order matters: `enforce: "pre"` for `resolvePlugin`, `enforce: "post"` for `tiSymbolsPlugin` and the `moduleRunnerTransformPlugin`.
- `tiSymbolsPlugin` is `apply: "build"` only — never read symbol data in dev hooks.
- `moduleRunnerTransformPlugin` skips `app.js` (the Titanium entry). Mirror that exclusion if you add chunks that must remain untransformed.
- This package depends on `@titanium-sdk/vite-titanium-environment` for `createTitaniumEnvironment()`, registered in `shared/core.ts`.

## ANTI-PATTERNS
- Don't read `process.env` directly — the bridge context (`TiBridgeApi.context` from `@titanium-sdk/vite-utils`) is the documented channel; env-var fallbacks emit migration warnings per `docs/ti-bridge-plan.md`.
- Don't extend `tryProjectRootResolve` in `shared/resolve.ts:79` — it's pre-Ti7 legacy compat (the deprecation note at `:84` says it "was supposed to be removed in Titanium 7.0 but never happened").
- `validatePlatform` only accepts `"ios" | "android"`. To add a platform, update `Platform` in `@titanium-sdk/vite-utils` first; don't widen the check inline.

## NOTES
- Build is plain `tsc` (no Rollup). `dist/index.js` is the published entry; consumers get types straight from `src/index.ts` (see `package.json` `exports`).
- No tests in this package.
