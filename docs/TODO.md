# TODO

## Bootstrap Require Migration

`*.bootstrap.js` files need dedicated handling before migrating their remaining
`require()` calls.

- Titanium executes bootstrap scripts before the main app entry.
- The runtime loads bootstrap names from `ti.internal/bootstrap.json`; if that
  file is missing, it scans packaged resources for `*.bootstrap.js`.
- Bootstrap scripts are loaded in sorted order with Titanium's CommonJS
  `require()`.
- If a bootstrap module exports `execute(callback)`, Titanium waits for the
  callback before continuing to the next bootstrap and then the app entry.
- Vite builds emit Alloy bootstrap scripts as separate CommonJS entries in both
  build and serve mode so Titanium can keep loading them through the normal
  bootstrap loader.

Do not mechanically convert platform-guarded native module `require()` calls in
bootstrap files to unconditional static imports. Static imports can load the
wrong platform's native module before the guard runs.

Preferred follow-up:

- Design a bootstrap-specific migration path.
- Preserve pre-app execution order.
- Preserve optional `execute(callback)` waiting semantics.
- Prefer platform-specific bootstrap entry files when readability of pre-app
  platform actions matters, for example `lambus.bootstrap.ios.js` and
  `lambus.bootstrap.android.js`.
- Keep platform-only native modules behind platform-specific entry files,
  platform-specific facades, or guarded async imports with explicit callback
  completion.
- Validate in both normal build/run and serve mode before marking bootstrap
  require migration complete.
