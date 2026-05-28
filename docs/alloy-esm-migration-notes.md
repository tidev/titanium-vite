# Alloy ESM Migration Guide Notes

Base notes for a general Alloy ESM migration guide. Keep concise.

## Current Direction

- Vite-built Titanium apps should author Alloy code as ESM.
- Do not use `module.exports` or `exports.*` in app/controller/model source for Vite builds.
- Vite builds fail when Alloy controller or model source contains legacy
  `exports.*` or `module.exports` syntax.
- Any CJS emitted for the Titanium runtime is an implementation detail, not the source contract.

## Static Loading Contract

- Titanium Vite dev mode preloads only shared Alloy runtime modules and sync adapters.
- App-owned controllers, models, collections, and widgets must enter the graph through ESM imports.
- The app entry imports `/alloy/controllers/index` directly and instantiates it.
- Static XML-generated dependencies should be emitted by alloy-devkit as ESM imports.
- XML UI nodes using `module="..."` should be emitted as ESM namespace imports and generated create calls should use that binding instead of runtime `require(...)`.
- In Titanium Vite Alloy builds, XML `module="..."` values remain Alloy module ids, not app-authored JavaScript import specifiers. If the module id resolves to an app-local module under `app/lib`, the compiler emits a Vite-native `~` alias import. For example, `module="xp.ui"` with `app/lib/xp.ui.js` becomes `import * as ... from "~/lib/xp.ui"`.
- Literal app-authored `Alloy.createController()`, `Alloy.createModel()`, `Alloy.createCollection()`, and `Alloy.createWidget()` calls are compiler-rewritten to static ESM imports in Alloy ESM mode.
- Unbounded dynamic controller/model names remain migration errors in Alloy ESM
  mode. App code should either refactor them to explicit static imports for
  small finite sets, or to Vite-native eager `import.meta.glob()` maps for
  static-prefix dynamic sets.
- Alloy runtime sync adapter loads remain internal runtime dependencies. Vite
  may wrap optimized CJS adapters in ESM namespaces, so the Alloy runtime
  compatibility layer must normalize those adapter objects before `Alloy.M()`
  or `Alloy.C()` call adapter hooks.

## Dynamic Controller Names

- Prefer explicit static imports when a dynamic controller choice is a small
  finite set across unrelated directories:
  ```js
  import LoginController from "./auth/login.js";
  import ContainerController from "./container.js";

  const controller = loggedIn
    ? new ContainerController(args)
    : new LoginController(args);
  ```
- Use eager `import.meta.glob()` when the dynamic part is bounded by a static
  directory prefix:
  ```js
  const controllers = import.meta.glob("./properties/*.js", {
    eager: true,
    import: "default",
  });

  const Controller = controllers[`./properties/${type}.js`];
  if (!Controller) throw new Error(`Unknown property controller: ${type}`);
  const controller = new Controller(args);
  ```
- Do not preserve arbitrary `Alloy.createController(name)` in ESM mode unless
  the possible module set is statically visible to Vite.

## Widget Definitions

- Static XML `<Widget>` and `<Require type="widget">` dependencies should be emitted as ESM imports from `/alloy/widgets/<id>/controllers/<name>`.
- Widget-authored literal `Widget.createController()`, `Widget.createModel()`, and `Widget.createCollection()` calls are compiler-rewritten to static ESM imports in Alloy ESM mode.
- ESM widget controllers should not rely on runtime `WPATH()` for module loading.
- Legacy `require(WPATH("module"))` is a migration error in ESM mode. Convert it to a static ESM import from the widget lib module, for example `import * as Button from "/alloy/widgets/<id>/lib/button"`, or use named imports when the target module has named exports.
- Dynamic `WPATH()` module loading remains a migration error in ESM mode.

## Controller Exports

- Public controller interface methods should use ESM exports:
  ```js
  export const open = () => {};
  export function show() {}
  ```
- Alloy DevKit maps ESM controller exports onto the `$` controller interface.

## Model Definitions

- Alloy model definitions should use:
  ```js
  export const definition = {};
  ```
- Avoid legacy:
  ```js
  exports.definition = {};
  ```

## Migration Codemod

- Use the reusable jscodeshift package for app-source migrations:
  ```bash
  npx @titanium-sdk/vite-codemod migrate-cjs-exports path/to/app
  npx @titanium-sdk/vite-codemod migrate-cjs-exports path/to/app --check
  npx @titanium-sdk/vite-codemod migrate-cjs-requires path/to/app
  npx @titanium-sdk/vite-codemod migrate-cjs-requires path/to/app --check --fail-on-unsupported=true
  npx @titanium-sdk/vite-codemod migrate-widget-wpath-requires path/to/app
  npx @titanium-sdk/vite-codemod migrate-widget-wpath-requires path/to/app --check
  ```
- The codemod rewrites inline CommonJS exports to inline ESM declarations where safe:
  ```js
  exports.open = () => {};
  ```
  becomes:
  ```js
  export const open = () => {};
  ```
- Reference exports become ESM export lists, preserving aliases when needed:
  ```js
  exports.open = show;
  ```
  becomes:
  ```js
  export { show as open };
  ```
- If `exports.name = ...` would collide with an existing local or imported `name`, the codemod fails that file instead of inventing a helper alias. Rename the existing binding or migrate that export manually so the public export name stays intentional.
- The walker skips generated/dependency directories such as `Resources`, `build`, `dist`, `modules`, `node_modules`, `plugins`, and `references`.
- `migrate-cjs-requires` rewrites safe static `require()` usages to ESM imports, including top-level and nested declarations, inline member access, assignments, return values, call arguments, and bounded JSON template requires backed by eager `import.meta.glob()` maps. Platform-guarded native module requires in shared code become dynamic ESM imports only when the nearest containing function is already `async`; sync cases are left for manual wrappers or app abstractions. Unsupported CommonJS can be audited with `--fail-on-unsupported=true`.
- `migrate-cjs-requires` rewrites resolvable app-local Titanium bare paths to the Vite-native `~` app-root alias. For Alloy, `~` points at `app/`, so legacy paths such as `json/countries/en.json`, `json/countries/*.json`, and `app-utils` become `~/assets/json/countries/en.json`, `~/assets/json/countries/*.json`, and `~/lib/app-utils`.
- `migrate-cjs-requires` emits default imports for package, builtin, and Titanium native whole-module requires so the generated code keeps the original runtime `require()` value. App-local whole-module requires still become namespace imports.
- Current codemod classification is path-based, not export-shape-aware. A resolvable app-local whole-module require is assumed to target named ESM exports and becomes a namespace import. That can break default-like value usage such as calling, constructing, returning, or assigning the required module object. Future codemod hardening should combine source classification, target export analysis, and local usage: namespace imports for member-only named-export access, default imports for default-only modules, and strict-mode failures for ambiguous app-local value usage.
- `migrate-widget-wpath-requires` rewrites top-level `const Module = require(WPATH("module"))` under `app/widgets/<id>/controllers/` to `import * as Module from "/alloy/widgets/<id>/lib/module"`. This belongs in codemods, not in Alloy DevKit runtime/compiler compatibility transforms.

## Import Specifiers

- `~` is the Titanium Vite app-root alias by default. It maps to `app/` for Alloy and `src/` for classic apps; app-provided `~` aliases take precedence.
- Prefer bare Alloy imports such as `alloy/underscore`.
- Avoid new leading-slash Alloy imports such as `/alloy/underscore` in migrated
  app source.
- Prefer static ESM imports for Titanium native modules used from app ESM source when the module is available on every target platform that can load the file. Use guarded dynamic `await import("native.module")` inside existing async functions for platform-only native modules in shared source.
- App-authored JavaScript should use Vite-native app-local imports such as `~/lib/xp.ui`. Alloy XML can keep app-local module ids such as `module="xp.ui"`; the Vite Alloy compiler normalizes those generated imports when the matching `app/lib` module exists.

## Known Follow-Up

- Expand these notes into a full migration guide before publishing the codemod broadly.
