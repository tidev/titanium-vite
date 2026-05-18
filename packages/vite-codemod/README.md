# @titanium/vite-codemod

Codemods for migrating Titanium and Alloy apps to Titanium Vite conventions.

The package delegates transform execution to `jscodeshift`.

## migrate-cjs-exports

Converts legacy Alloy CommonJS controller/model export assignments to valid ESM export declarations.

```bash
npx @titanium/vite-codemod migrate-cjs-exports path/to/app
npx @titanium/vite-codemod migrate-cjs-exports path/to/app --check
```

The command writes changes by default, matching standard `jscodeshift` behavior. Use `--check` or `--dry` to run without writing.

The codemod currently handles:

- `exports.name = name;`
- `exports.name = () => {};`
- `exports.name = async () => {};`
- `exports.name = function () {};`
- `exports.name = value;`
- `const local = (exports.name = () => {});`
- `export const name = ...` declarations that need to be normalized for Alloy compiler compatibility

If an inline `exports.name = ...` assignment would collide with an existing local or imported `name` binding, the transform fails for that file instead of inventing a generated alias. Rename the conflicting binding or migrate that export manually so the resulting ESM keeps intentional names.

The walker skips generated and dependency directories such as `Resources`, `build`, `dist`, `modules`, `node_modules`, `plugins`, and `references`.
