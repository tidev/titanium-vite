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

## Import Specifiers

- Prefer bare Alloy imports such as `alloy/underscore`.
- Avoid new leading-slash Alloy imports such as `/alloy/underscore` in migrated
  app source.

## Known Follow-Up

- Expand these notes into a full migration guide before publishing the codemod broadly.
