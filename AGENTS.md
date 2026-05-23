# titanium-vite

**Generated:** 2026-05-08 · **Commit:** 2d3f832 · **Branch:** main

## OVERVIEW
Vite-based dev environment + plugin set for the Titanium SDK. Experimental, active development. pnpm/Turbo monorepo, TypeScript, Vite 8 (Rolldown 1.0.0-rc.18 / Oxc transformer). Bridges the Titanium CLI (`ti build`) and Vite via a typed, versioned context — see `docs/ti-bridge-plan.md`. Vite 7→8 migration notes: `docs/vite-8-migration-plan.md`.

## STRUCTURE
```
.
├── apps/
│   └── titanium-vite-classic/        # reference Titanium "classic" app for testing plugins
├── packages/
│   ├── vite-plugin-titanium/         # @titanium-sdk/vite-plugin-titanium — main plugin
│   ├── vite-plugin-titanium-alloy/   # @titanium-sdk/vite-plugin-titanium-alloy — Alloy MVC support
│   ├── vite-titanium-environment/    # @titanium-sdk/vite-titanium-environment — custom Vite environment
│   ├── polyfills/                    # @titanium-sdk/polyfills — TextEncoder/URL stubs for Ti runtime
│   └── utils/                        # @titanium-sdk/vite-utils — TiBridgeApi, ProjectType, Platform
├── tooling/
│   ├── eslint/                       # @titanium-sdk/eslint-config — flat config, type-checked rules
│   ├── prettier/                     # @titanium-sdk/prettier-config — @ianvs sort-imports
│   └── typescript/                   # @titanium-sdk/tsconfig — strict + noUncheckedIndexedAccess
├── docs/ti-bridge-plan.md            # contract spec for Titanium ↔ Vite handoff
├── pnpm-workspace.yaml               # workspaces + dependency catalog
└── turbo.json
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Bridge contract / data flow | `docs/ti-bridge-plan.md`, `packages/utils/src/types.ts` |
| Wire all plugins | `packages/vite-plugin-titanium/src/index.ts` (`titanium(opts)`) |
| Classic project type | `packages/vite-plugin-titanium/src/classic/` |
| Alloy project type | `packages/vite-plugin-titanium-alloy/src/` |
| Vite env / dev / build runners | `packages/vite-titanium-environment/src/environment.ts` |
| `Ti.*` / `Titanium.*` symbol collection | `packages/vite-plugin-titanium/src/shared/ti-symbols.ts` |
| Platform-aware module resolution | `packages/vite-plugin-titanium/src/shared/resolve.ts` |
| `/invoke` dev middleware (HMR bridge) | `packages/vite-plugin-titanium/src/shared/core.ts:50` |
| Reference app | `apps/titanium-vite-classic/` (built via `ti build`) |

## RELATED LOCAL REPOS
| Repo | Location |
|------|----------|
| Alloy | `../alloy` |
| Alloy DevKit | `../alloy-devkit` |
| Titanium CLI | `../titanium-cli` |
| Titanium SDK | `../titanium_mobile` |
| Lambus Titanium App | `../lambus-titanium` |

## CONVENTIONS
- This repo is pre-release. Prefer the cleaner long-term architecture over
  compatibility-preserving patches, even when that introduces breaking changes.
  Leave the repository in a better structural state than before the work.
- **pnpm catalog** manages shared versions (`vite`, `vitest`, `typescript`, `eslint`, `prettier`, `zod`, `@types/node`). Reference as `"vite": "catalog:"` in package.json — never pin directly.
- **TS**: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, target `es2022`. tsbuildinfo cached at `.cache/tsbuildinfo.json`.
- **ESLint** flat config (`@titanium-sdk/eslint-config/base`) extends `recommendedTypeChecked` + `stylisticTypeChecked` — type-aware rules require `parserOptions.projectService: true`.
- Every package exports types from `src/index.ts` and JS from `dist/index.js`:
  ```json
  "exports": { ".": { "import": "./dist/index.js", "types": "./src/index.ts" } }
  ```
  Consumers get pre-emit types — keep `src/index.ts` clean of build-only constructs.
- `postinstall` runs `pnpm dlx sherif@latest` to detect cross-workspace dependency drift.
- ESM-only. Every package has `"type": "module"`.
- Keep `docs/alloy-esm-migration-notes.md` updated when changing Alloy/Vite ESM behavior, app-source migration requirements, or runtime interop assumptions. Treat it as a concise scratchpad for a future full migration guide.

## ANTI-PATTERNS (THIS PROJECT)
- `@typescript-eslint/no-non-null-assertion: error` — no `x!`. Also matches the user's global rule.
- `consistent-type-imports` enforces separate `import type` blocks (`fixStyle: "separate-type-imports"`).
- `no-restricted-properties` blocks `process.env` direct access (rule available; intent is to use a validated env object).
- Outstanding FIXMEs — do not duplicate without fixing the underlying issue:
  - `packages/vite-plugin-titanium/src/shared/resolve.ts:69` — platform-specific override fallback unimplemented.
  - `packages/vite-plugin-titanium-alloy/src/context.ts:86` — `webpack: false` hardcoded.
  - `packages/vite-plugin-titanium-alloy/src/core.ts:148` — controller `.default` patching disabled pending per-project ESM-mode control.
- Legacy bare-module → project-root resolution (`shared/resolve.ts:84`) exists for pre-Ti7 compat. Do not extend.
- Don't introduce `eval`.

## COMMANDS
```bash
pnpm install            # also runs sherif workspace check
pnpm dev                # turbo watch dev — persistent, no cache
pnpm build              # turbo build (deps-first, tsc per package)
pnpm test               # vitest
pnpm typecheck
pnpm lint / lint:fix    # cached at .cache/.eslintcache
pnpm format             # prettier --cache .cache/.prettiercache

# Inside apps/titanium-vite-classic:
ti build                # Titanium CLI; relies on built plugins
```

## NOTES
- Bridge plan (`docs/ti-bridge-plan.md`) is **partially implemented**: `TiBridgeApi` types and `tiSymbolsPlugin`'s `reportTiApiUsage` callback live here; the Titanium-CLI side (`createTiViteBridge`, `buildId` validation, sidecar fallback) is in the Titanium SDK repo, not this one.
- `tiSymbolsPlugin` is `apply: "build"` only — symbol data is not collected in dev.
- No CI workflows in `.github/` yet.
- Plugin test coverage is still sparse; add focused Vitest coverage for behavior changes.
