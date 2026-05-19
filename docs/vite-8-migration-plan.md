# Vite 8 Migration Plan

**Status:** Draft · **Target:** `vite@^8.0.11` (Rolldown 1.0.0-rc.18, Oxc-based transformer)
**Scope:** monorepo catalog bump + adjustments to three plugin packages

## 1. Background

Vite 8.0.0 shipped 2026-03-12 (current `8.0.11`, 2026-05-07). It replaces:

- **Rollup → Rolldown** (Rust bundler) for both `optimizeDeps` and `build`
- **esbuild → Oxc** (Rust transformer) for TS/JSX/transform/minify
- **esbuild CSS minify → Lightning CSS** as default

A compatibility layer auto-converts `build.rollupOptions` → `build.rolldownOptions` and `esbuild.*` → `oxc.*`, so most plugins keep working — but every shim the layer relies on is "deprecated, will be removed". We migrate explicitly so we're not surprised by 8.x → 9 cleanup.

### What stays exported from `vite`

Confirmed from `vite@8.0.11/dist/node/index.js`:

`BuildEnvironment`, `DevEnvironment`, `mergeConfig`, `normalizePath`, `moduleRunnerTransform` (now an alias of `ssrTransform`), `createFilter`, `Plugin`, `ResolvedConfig`, `HotPayload`, `EnvironmentOptions`, `DevEnvironmentContext`, `ViteDevServer`, `EnvironmentModuleNode`, `rollupVersion` (compat), `rolldownVersion`, plus new `transformWithOxc`, `parseSync`, `parse`, `Visitor`, `esmExternalRequirePlugin`.

### What's gone or behaviorally different

- **Plugin hooks no longer parallel** — all hooks Rollup ran in parallel now run sequentially.
- **Unsupported hooks:** `shouldTransformCachedModule`, `resolveImportMeta`, `renderDynamicImport`, `resolveFileUrl`. We don't use these.
- **`load` / `transform` returning JS-as-string** — must include `moduleType: 'js'` if the source isn't already JS-typed, otherwise Rolldown won't bundle it.
- **`bundle` reference is no longer shared between `generateBundle`/`writeBundle`**, and assigning to `bundle[key]` is unsupported.
- **Comment handling around `renderChunk` changed.**
- **`build.rollupOptions` → `build.rolldownOptions`** (deprecated alias).
- **`build.commonjsOptions` is now a no-op** (Rolldown handles CJS natively).
- **`output.format: 'system' | 'amd'` removed**; `output.manualChunks` object-form removed, function-form deprecated.
- **Default `build.target` raised** (Chrome 111 / Firefox 114 / Safari 16.4). We pin `'ios13'` explicitly, so the default doesn't affect us, but Oxc may interpret targets differently than esbuild did — see §4.
- **`import.meta.hot.accept(url, …)`** — URL form removed; pass module ids only.
- **`parseAst` / `parseAstAsync` deprecated** in favour of `parseSync` / `parse` from `rolldown/utils`.
- **Rollup types come via a compat shim** (`#types/internal/rollupTypeCompat`); they still resolve from `rollup`, but the canonical source for AST/plugin types is now `rolldown`.

## 2. Impact Inventory

| File | Item | Action |
|------|------|--------|
| `pnpm-workspace.yaml` | `vite: ^7.0.6` | bump to `^8.0.11` |
| `pnpm-workspace.yaml` | `allowBuilds.esbuild: true` | keep — Oxc/Rolldown ship as `.node`, but esbuild is still a transitive dep for the compat layer |
| `packages/vite-plugin-titanium/package.json` | devDep `rollup: ^4.40.2` | drop (replaced by `rolldown`) |
| `packages/vite-plugin-titanium/package.json` | (new) | add `rolldown: ^1.0.0-rc.18` to deps — needed for `import type { ESTree } from "rolldown/utils"` (Vite 8 doesn't re-export `ESTree`; strict pnpm requires explicit declaration) |
| `packages/vite-plugin-titanium/package.json` | devDep `@types/estree: ^1.0.8` | drop — only used by the now-rewritten `ti-symbols.ts` |
| `packages/vite-plugin-titanium-alloy/package.json` | devDep `rollup: ^4.40.2` | drop |
| `packages/vite-plugin-titanium-alloy/package.json` | (new) | add `rolldown: ^1.0.0-rc.18` to deps — needed for `import type { ResolvedId } from "rolldown"` |
| `packages/vite-plugin-titanium-alloy/package.json` | dep `@rollup/pluginutils: ^5.1.4` | replace `createFilter` import with `vite`'s re-export, then drop |
| `packages/vite-plugin-titanium-alloy/package.json` | dep `@rollup/plugin-node-resolve: ^16.0.1` | **keep** — see §3.5 |
| `packages/vite-plugin-titanium/package.json` | dep `vite-plugin-static-copy: ^2.3.1` | bump to `^3.3.0` — v2 peer-caps at Vite 6; v3.3.0 is first release listing Vite 8. Avoid v4 (glob/`structured` breaking changes). |
| `packages/vite-plugin-titanium/src/shared/ti-symbols.ts` | `moduleParsed` + `walk(info.ast)` + `import { AstNode } from "rollup"` | rewrite as `transform` + `parseSync` + `Visitor`; drop `rollup`/`estree` type imports — see §3.2 |
| `packages/vite-plugin-titanium-alloy/src/component.ts:5-6` | `createFilter` from `@rollup/pluginutils`; `ResolvedId` from `rollup` | switch both to `vite` re-exports / `rolldown` types |
| `packages/vite-plugin-titanium/src/shared/core.ts:37-41` | `esbuild.supported['top-level-await'] = true` | replace with `oxc` config (or remove — TLA is in baseline now) |
| `packages/vite-titanium-environment/src/build.ts:20` | `rollupOptions` | rename to `rolldownOptions`, re-validate `output.entryFileNames` typing |
| `packages/vite-plugin-titanium/src/index.ts:36-53` | `moduleRunnerTransform` post-`renderChunk` plugin | retained, but verify chunk-comment behavior change doesn't break the SSR-style transform output |
| `packages/vite-plugin-titanium-alloy/src/core.ts:90-101` | `optimizeDeps.entries` glob (`!(...)` extglob) | Oxc-based scanner has limited extglob support — verify or rewrite |

## 3. Detailed Changes

### 3.1 Catalog bump + Vite-peer-dep deps

```yaml
# pnpm-workspace.yaml
catalog:
  vite: ^8.0.11
```

```jsonc
// packages/vite-plugin-titanium/package.json
- "vite-plugin-static-copy": "^2.3.1"
+ "vite-plugin-static-copy": "^3.3.0"
```

`vite-plugin-static-copy@^2.3.1` peer-caps at `vite ^5 || ^6` and only resolves under Vite 7 thanks to pnpm's lenient peer checking. `^3.3.0` is the first release listing `^8.0.0` in its peer range and keeps the v2/v3 API. **Do not jump to v4** — v4 changed glob semantics ("only files are matched, glob patterns no longer match directory entries") and removed the `structured` option; our usage in `packages/vite-plugin-titanium/src/classic/assets.ts` passes literal directory paths (`src/assets`, `src/iphone`, …) that v3-era docs treat as globs, and we don't have an Alloy fixture to confirm v4 still copies them as expected.

Other Vite-peer audit (no other action needed):

- `alloy-compiler@^0.2.7` — no peer deps.
- `@rollup/plugin-node-resolve`, `@rollup/pluginutils`, `rollup`, `tinyglobby`, `fs-extra`, `fast-xml-parser` — none declare a Vite peer.

Run `pnpm install`; sherif (`postinstall`) will catch any cross-workspace drift.

### 3.2 `tiSymbolsPlugin` — switch from `moduleParsed` to `transform` + `parseSync` + `Visitor`

**Decision: mandatory rewrite** — not a stylistic choice. Empirically verified against `vite@8.0.11` + `rolldown@1.0.0-rc.18` in a standalone probe: accessing `info.ast` from `moduleParsed` throws synchronously.

```
Error: UNSUPPORTED: ModuleInfo#ast
    at unsupported (rolldown/.../misc-DJYbNKZX.mjs:17:8)
    at get ast (rolldown/.../bindingify-input-options-DQ2Xw70P.mjs:642:11)
    at PluginContextImpl.moduleParsed (...)
```

The `ast` getter on Rolldown's `ModuleInfo` is a deliberate `unsupported()` stub (see `transformModuleInfo` in `bindingify-input-options-DQ2Xw70P.mjs:639-657`). Supported `ModuleInfo` fields are: `code`, `id`, `importers`, `dynamicImporters`, `importedIds`, `dynamicallyImportedIds`, `exports`, `isEntry`, `inputFormat`, plus user `meta`. There is no replacement field — Rolldown's design moves AST inspection out of `ModuleInfo` and into explicit parse APIs.

The current `tiSymbolsPlugin` therefore crashes every Vite 8 build until rewritten. We use `parseSync` + `Visitor`, both re-exported from `vite` (canonical source: `rolldown/utils`):

```ts
declare function parseSync(filename: string, sourceText: string, options?: ParserOptions | null): ParseResult;
declare class Visitor {
  constructor(visitor: VisitorObject); // keyed by ESTree node type names; `:exit` variants supported
  visit(program: Program): void;
}
```

(`PluginContextImpl.parse(input)` also exists and delegates to `parseAst` — but `parseAst` is deprecated in v8 in favour of `parseSync`, so we go straight to the latter rather than build on a deprecated API.)

```ts
declare function parseSync(filename: string, sourceText: string, options?: ParserOptions | null): ParseResult;
declare class Visitor {
  constructor(visitor: VisitorObject); // keyed by ESTree node type names; `:exit` variants supported
  visit(program: Program): void;
}
```

Node types come from `@oxc-project/types` via the `ESTree` namespace. `Visitor` is marked `@experimental`; if it changes shape we fall back to a 15-line manual walker.

New shape of the plugin (`packages/vite-plugin-titanium/src/shared/ti-symbols.ts`):

```ts
import path from "node:path";
import type { TiBridgeApi } from "@titanium-sdk/vite-utils";
import type { Plugin, ResolvedConfig } from "vite";
import type { ESTree } from "rolldown/utils";
import { cleanUrl, TI_BRIDGE_PLUGIN_NAME } from "@titanium-sdk/vite-utils";
import { normalizePath, parseSync, Visitor } from "vite";

function memberToString(node: ESTree.Expression | ESTree.Super): string | null {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type !== "MemberExpression") return null;
  const obj = memberToString(node.object);
  const prop = memberToString(node.property);
  if (obj == null || prop == null) return null;
  return `${obj}.${prop}`;
}

function isTiSymbol(expr: string): boolean {
  return expr.startsWith("Ti.") || expr.startsWith("Titanium.");
}

export function tiSymbolsPlugin(): Plugin {
  let bridge: TiBridgeApi;
  let config: ResolvedConfig;
  const symbolsByFile = new Map<string, Set<string>>();

  return {
    name: "titanium:ti-symbols",
    apply: "build",
    enforce: "post",

    buildStart() { symbolsByFile.clear(); },

    configResolved(c) {
      config = c;
      const bridgePlugin = c.plugins.find((p) => p.name === TI_BRIDGE_PLUGIN_NAME);
      if (!bridgePlugin) throw new Error(`"${TI_BRIDGE_PLUGIN_NAME}" plugin not found.`);
      bridge = bridgePlugin.api as TiBridgeApi;
    },

    transform(code, id) {
      const cleanId = cleanUrl(id);
      if (!/\.[cm]?[jt]sx?$/.test(cleanId)) return;
      if (cleanId.includes("/node_modules/")) return;

      const result = parseSync(cleanId, code);
      const file = normalizePath(path.relative(config.root, cleanId));
      const fileSymbols = new Set<string>();

      new Visitor({
        MemberExpression(node) {
          if (node.object.type === "Literal") return;
          const expr = memberToString(node);
          if (expr && isTiSymbol(expr)) fileSymbols.add(expr);
        },
      }).visit(result.program);

      symbolsByFile.set(file, fileSymbols);
      return null;
    },

    closeBundle() {
      const tiSymbols: Record<string, string[]> = {};
      for (const [file, set] of symbolsByFile) tiSymbols[file] = [...set].sort();
      bridge.reportTiApiUsage(tiSymbols);
    },
  };
}
```

Wins:
- No `import type { AstNode } from "rollup"`, no `import type { Node, MemberExpression } from "estree"`.
- No `as unknown as AstNode` casts — `memberToString`'s recursive type is `ESTree.Expression | ESTree.Super`, which is what `MemberExpression.object`/`.property` actually allow.
- AST source is ours; `info.ast`'s shape under Rolldown is no longer a dependency.

Tradeoff:
- Re-parses every JS/TS file at `transform` time. `apply: 'build'` keeps this prod-only. Add a `code`-hash cache later only if profiling shows it matters.

### 3.3 Alloy `componentPlugin` types

```ts
// packages/vite-plugin-titanium-alloy/src/component.ts
- import { createFilter } from '@rollup/pluginutils';
- import type { ResolvedId } from 'rollup';
+ import { createFilter } from 'vite';
+ import type { ResolvedId } from 'rolldown';
```

`vite`'s `createFilter` is the same `@rollup/pluginutils` helper, re-exported. After this change, `@rollup/pluginutils` can be removed from this package's deps.

### 3.4 `rollupOptions` → `rolldownOptions`

```ts
// packages/vite-titanium-environment/src/build.ts
- rollupOptions: {
+ rolldownOptions: {
    input: ["virtual:titanium/module-runner", "virtual:titanium/main"],
    output: {
      entryFileNames: (chunk) => { /* unchanged */ },
    },
  },
```

`OutputOptions.entryFileNames` exists on Rolldown with the same signature. `chunk.name` and `chunk.fileName` are preserved. No behavior change expected.

### 3.5 `nodeResolve` from `@rollup/plugin-node-resolve` — keep

**Decision:** keep this round.

Rationale:

- The plugin does non-trivial work: scoped `rootDir`/`jail` Node resolution for `app/lib`, `package.json` exports/main/module field handling, subpath imports, `preferBuiltins`, plus a custom `dedupe(importee)` callback forcing bare imports to resolve from `rootDir`. Reimplementing that on `this.resolve` is at least a day's work — without an Alloy test fixture to validate it.
- Rolldown explicitly preserves Rollup-plugin compatibility. `@rollup/plugin-node-resolve` is one of the most-exercised Rollup plugins; if any plugin is end-to-end safe under the compat layer, it's this one.
- This migration's risk surface should stay focused on Vite 7→8 API changes. Bundling a resolver rewrite into the same diff would conflate failure modes if `ti build` regresses.
- `apps/titanium-vite-classic` is a Classic project — it doesn't exercise the Alloy resolver path at all, so we'd be flying blind on correctness.

The followup remains valid (see §7); the right time to do it is *after* an Alloy fixture exists, not before.

### 3.6 `esbuild.supported.top-level-await` — drop

```ts
// packages/vite-plugin-titanium/src/shared/core.ts
- esbuild: {
-   supported: { 'top-level-await': true },
- },
```

**Decision:** delete. Empirically, no TLA exists anywhere in the project today:

- `apps/titanium-vite-classic/src/{app,test,utils}.js` — no module-scope `await`.
- `packages/vite-plugin-titanium/src/shared/module-runner.ts:103` — `await moduleRunner.import(...)` is wrapped in `(async () => { … })()` (IIFE, not TLA).
- The other `await` site in `module-runner.ts:43` is inside a commented-out block.

The flag is dead config, likely a leftover from earlier module-runner experimentation when the entry import was at module scope. No `oxc` replacement needed.

If TLA becomes necessary later (most plausibly by un-wrapping the IIFE in `module-runner.ts`), the right fix is **not** a per-syntax override; it's revisiting `target: 'ios13'`. The target string lies about runtime capability — Titanium's JSCore is host-managed and decoupled from the Safari version implied by `ios13`. A cleaner future approach: model the actual JSCore baseline per Titanium SDK release (or just drop the target pin where Oxc's defaults already cover us).

### 3.7 `optimizeDeps.entries` extglob

```ts
config.optimizeDeps.entries = [
  `controllers/!(${otherPlatform[platform]})/**/*.@(j|t)s`,
  `lib/!(${otherPlatform[platform]})/**/*.@(j|t)s`,
];
```

Vite 8 dev-server now uses Rolldown-compatible glob enumeration with **extglobs disabled for consistency** (changelog `v8.0.0` "**dev:** disable extglobs for consistency"). The `!(android)` and `@(j|t)s` patterns are extglob syntax. Two viable rewrites:

- Enumerate platforms: `[\`controllers/${platform}/**/*.{js,ts}\`, \`controllers/shared/**/*.{js,ts}\`, …]`
- Drop the negation, post-filter via a `vite` `Plugin.resolveId` or pre-pass — uglier.

Recommend the first.

### 3.8 Module-runner virtual entry & `moduleRunnerTransform` post-plugin

`moduleRunnerTransform` is still exported (aliased from `ssrTransform`). The `renderChunk` post-plugin in `packages/vite-plugin-titanium/src/index.ts:36-53` should keep working, but two items to verify:

1. **Comment positioning** — Vite 8 strips comments *before* `renderChunk` for non-specified comments. Our transform doesn't depend on comments, so this is informational.
2. **Chunk identity** — we filter by `chunk.fileName === "app.js"`. Verify Rolldown still produces a chunk with this name given our `entryFileNames` logic. Empirically check the `dist/Resources/` output.

## 4. Build target nuance

We pin `target: 'ios13'` in two places (`packages/vite-plugin-titanium/src/shared/core.ts:21`, `packages/vite-titanium-environment/src/build.ts:14`). Vite 8 added iOS to default Oxc targets (changelog: "add ios to default esbuild targets" #21342, applied to Oxc by the compat layer). Our explicit pin overrides the default, but Oxc's lowering for `ios13` may differ from esbuild's:

- Oxc reportedly does **not lower native decorators** — we don't use decorators in plugin output, so this is fine for now.
- Oxc's property-mangling options (`mangleProps`, `reserveProps`, etc.) are unsupported. We don't use these.
- Output minification defaults to Oxc; if any minified output shape mattered (e.g. for the Titanium asset packager), spot-check.

## 5. Migration order (commit-by-commit)

Each commit keeps `pnpm typecheck && pnpm build` (= `tsc` per package) clean. **End-to-end runtime validation (`ti build` of the classic app) happens only at the end** — between commits the plugin set is in a half-migrated state and a real Titanium build will crash on `info.ast`. Type compilation alone is the per-commit gate.

1. `chore(workspace): bump vite to ^8.0.11 and vite-plugin-static-copy to ^3.3.0` — catalog bump + the only Vite-peer-dep bump that blocks Vite 8. Add `rolldown: ^1.0.0-rc.18` as a dep in both `@titanium-sdk/vite-plugin-titanium` and `@titanium-sdk/vite-plugin-titanium-alloy` (consumed by §3.2 and §3.3). Lockfile churn; expect type errors in the next commits.
2. `refactor(env): rename rollupOptions to rolldownOptions` — `packages/vite-titanium-environment/src/build.ts`.
3. `refactor(alloy): source createFilter from vite, ResolvedId from rolldown` — `component.ts`; remove `@rollup/pluginutils` from `package.json`.
4. `refactor(plugin): rewrite tiSymbolsPlugin on parseSync + Visitor` — `ti-symbols.ts`. Removes `moduleParsed`/`rollup`/`estree` deps. **This is the commit that unbreaks runtime builds.**
5. `refactor(plugin): drop dead esbuild.supported.top-level-await flag` — `core.ts`. No `oxc` replacement (no TLA in source).
6. `refactor(alloy): rewrite optimizeDeps.entries without extglobs` — `core.ts`.
7. `chore: drop unused rollup devDeps and @types/estree` — `@titanium-sdk/vite-plugin-titanium` and `@titanium-sdk/vite-plugin-titanium-alloy`.
8. `chore(docs): note Vite 8 baseline in AGENTS.md`.

## 6. Validation

- `pnpm typecheck` clean across all workspaces.
- `pnpm build` clean.
- `cd apps/titanium-vite-classic && ti build` produces a working app on iOS simulator. This is the only end-to-end signal we have, since plugin packages have no tests today (per `AGENTS.md`).
- Inspect `apps/titanium-vite-classic/Resources/` after build:
  - `app.js` exists and runs the module-runner shim.
  - `<entry>.js` chunks contain `moduleRunnerTransform` output (require-style imports preserved).
  - `tiSymbols` reported via `bridge.reportTiApiUsage` is non-empty and matches what the source actually references.

## 7. Followups (out of scope)

- Replace `@rollup/plugin-node-resolve` with a small custom `resolveId` plugin scoped to `app/lib`, eliminating the last Rollup-plugin dependency. Gate on having an Alloy fixture in the repo first — Classic doesn't exercise this path. Re-evaluate sooner if Vite 9 deprecates Rollup-plugin compat.
- Add a content-hash cache to `tiSymbolsPlugin.transform` if prod-build profiling shows the per-file `parseSync` cost matters.
- Drop the `as TiBridgeApi` cast in `configResolved` once the bridge plugin's `api` field is properly typed.
- Add at least smoke-level tests to `@titanium-sdk/vite-plugin-titanium` and `@titanium-sdk/vite-plugin-titanium-alloy` so future Vite bumps aren't gated on a manual `ti build` run.

## 8. Unresolved questions

- ~~`moduleParsed.info.ast` shape under Rolldown — estree-clean or Oxc-extended?~~ Resolved by empirical probe (`vite@8.0.11` + `rolldown@1.0.0-rc.18`): the `ast` getter on `ModuleInfo` throws `UNSUPPORTED: ModuleInfo#ast`. There is no AST shape — the field is a deliberate stub with no replacement. Rewrite via `parseSync` + `Visitor` is mandatory. See §3.2.
- ~~`apply: 'build'` AST collection: stay on `moduleParsed` or move to `transform`+`parseSync` now?~~ Resolved: move now.
- ~~Need TLA to be **preserved** (not lowered) at `ios13` target?~~ Resolved: no TLA in source today; flag dropped, no replacement. See §3.6.
- ~~Keep `@rollup/plugin-node-resolve`, or replace with custom plugin in this round?~~ Resolved: keep. See §3.5; replacement deferred to followup pending an Alloy test fixture or Vite 9 compat-layer changes.
- ~~Any production consumer pinning Vite 7 transitively that would block the catalog bump?~~ Resolved: yes — `vite-plugin-static-copy@^2.3.1` peer-caps at Vite 6 (works under Vite 7 only via lenient peer resolution). Bump to `^3.3.0` in the same commit as the catalog bump. See §3.1.

All planning questions resolved.
