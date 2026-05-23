# Alloy ESM Migration Guide Notes

Base notes for a general Alloy ESM migration guide. Keep concise.

## Current Direction

- Vite-built Titanium apps should author Alloy code as ESM.
- Do not use `module.exports` or `exports.*` in app/controller/model source for Vite builds.
- Vite builds fail when Alloy controller or model source contains legacy
  `exports.*` or `module.exports` syntax.
- Any CJS emitted for the Titanium runtime is an implementation detail, not the source contract.

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

## Vite Runtime Notes

- Alloy model/controller files are dynamically loaded by Alloy/Titanium, so Vite/Rolldown entry exports must be preserved.
- `preserveEntrySignatures: "exports-only"` is used in the Titanium build environment for that contract.
- Production may still emit CommonJS wrappers for Titanium, but app source should stay ESM.

## Alloy Require Specifier Normalization

Verified against `../titanium_mobile/common/Resources/ti.internal/kernel/module.js`.

Titanium's CommonJS resolver is not symmetric for leading-slash and bare
requests:

- Relative requests (`./x`, `../x`) resolve against the parent module.
- Leading-slash requests (`/x`) are treated as app-root absolute resource paths
  and only call `loadAsFileOrDirectory('/x')`.
- Bare requests (`x` or `x/y`) try core/native modules, CommonJS package
  lookup, node_modules lookup, then fall back to the legacy app-root absolute
  path `/${request}`.

So `require("alloy/underscore")` may fall back to `/alloy/underscore`, but
`require("/alloy/underscore")` does not retry as `alloy/underscore`. This is
compatible with old Titanium app resources, but it conflicts with Vite's
specifier model where `/alloy/underscore` is root-absolute and
`alloy/underscore` is a bare package-like request.

Normalize Alloy runtime and generated Alloy specifiers for Vite as follows:

1. Treat `alloy` and `alloy/*` as the canonical Vite-facing Alloy namespace.
2. Rewrite static Alloy specifiers from `/alloy` and `/alloy/*` to `alloy` and
   `alloy/*` before Vite resolve, transform, or dependency optimization sees
   them.
3. Rewrite known Alloy dynamic require prefixes the same way:
   `/alloy/controllers/`, `/alloy/widgets/`, `/alloy/models/`,
   `/alloy/styles/`, and `/alloy/sync/`.
4. Keep true app-root imports such as `/app` as root-absolute Vite ids. The
   rewrite is only for the Alloy namespace.
5. Keep Vite aliases accepting both leading-slash and bare Alloy forms during
   migration, but emit/request the bare form internally.
6. Production CommonJS can also use bare Alloy requests because Titanium's
   legacy bare fallback still resolves them to `/alloy/*` when no core or
   node_modules module exists.

This prevents symlinked local Alloy installs from bypassing Vite dependency
optimization as real paths outside `node_modules`, and makes the resolver
contract match normal Vite semantics.

## Known Follow-Up

- Expand these notes into a full migration guide before publishing the codemod broadly.
