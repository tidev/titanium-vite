# Alloy ESM Migration Notes

Scratchpad for later migration-guide writing. Keep concise.

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

## Vite Runtime Notes

- Alloy model/controller files are dynamically loaded by Alloy/Titanium, so Vite/Rolldown entry exports must be preserved.
- `preserveEntrySignatures: "exports-only"` is used in the Titanium build environment for that contract.
- Production may still emit CommonJS wrappers for Titanium, but app source should stay ESM.

## Known Follow-Up

- Lambus app currently has many remaining `exports.*` controller/widget/lib sites.
- Only the startup-critical Lambus files were migrated during the blank-screen fix.
- Finish the broader migration after `lambus-platform/lambus-titanium#638` lands.
