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
- ESM widget controllers should not rely on runtime `WPATH()`.
- Literal legacy `require(WPATH("module"))` can be compiler-rewritten to an ESM import from `/alloy/widgets/<id>/lib/module`.
- Dynamic `WPATH()` remains a migration error in ESM mode.

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

## Import Specifiers

- Prefer bare Alloy imports such as `alloy/underscore`.
- Avoid new leading-slash Alloy imports such as `/alloy/underscore` in migrated
  app source.

## Known Follow-Up

- Expand these notes into a full migration guide before publishing the codemod broadly.
