# @titanium-sdk/vite-codemod

Codemods for migrating Titanium and Alloy apps to Titanium Vite conventions.

The package delegates transform execution to `jscodeshift`.

## migrate-cjs-exports

Converts legacy Alloy CommonJS controller/model export assignments to valid ESM export declarations.

```bash
npx @titanium-sdk/vite-codemod migrate-cjs-exports path/to/app
npx @titanium-sdk/vite-codemod migrate-cjs-exports path/to/app --check
```

The command writes changes by default, matching standard `jscodeshift` behavior. Use `--check` or `--dry` to run without writing.

The codemod currently handles:

- `exports.name = name;`
- `exports.name = () => {};`
- `exports.name = async () => {};`
- `exports.name = function () {};`
- `exports.name = value;`
- `const local = (exports.name = () => {});`

If an inline `exports.name = ...` assignment would collide with an existing local or imported `name` binding, the transform fails for that file instead of inventing a generated alias. Rename the conflicting binding or migrate that export manually so the resulting ESM keeps intentional names.

The walker skips generated and dependency directories such as `Resources`, `build`, `dist`, `modules`, `node_modules`, `plugins`, and `references`.

## migrate-cjs-requires

Converts safe top-level CommonJS `require()` declarations to static ESM imports.

```bash
npx @titanium-sdk/vite-codemod migrate-cjs-requires path/to/app
npx @titanium-sdk/vite-codemod migrate-cjs-requires path/to/app --check
npx @titanium-sdk/vite-codemod migrate-cjs-requires path/to/app --check --fail-on-unsupported=true
```

The codemod currently handles:

- `const Module = require("module");`
- `const data = require("path/to/data.json");`
- `const Module = require("module").default;`
- `const member = require("module").member;`
- `const { member, other: alias } = require("module");`

JSON requires are migrated to default imports. Other whole-module requires are migrated to namespace imports to preserve object-style member access.

By default, unsupported CommonJS usage is left unchanged so migration can be applied incrementally. Use `--fail-on-unsupported=true` during audits to fail files that still contain unsupported `require()`, `exports.*`, or `module.exports` syntax after safe rewrites. The CLI automatically enables jscodeshift's `--fail-on-error` for that audit mode.

## migrate-widget-wpath-requires

Converts legacy widget controller `require(WPATH("module"))` declarations to static ESM namespace imports from the widget's `lib` directory.

```bash
npx @titanium-sdk/vite-codemod migrate-widget-wpath-requires path/to/app
npx @titanium-sdk/vite-codemod migrate-widget-wpath-requires path/to/app --check
```

Example:

```js
const Button = require(WPATH("button"));
```

becomes:

```js
import * as Button from "/alloy/widgets/com.example.widget/lib/button";
```

The transform only applies inside `app/widgets/<id>/controllers/` files and only rewrites top-level variable declarations with literal `WPATH()` arguments.
