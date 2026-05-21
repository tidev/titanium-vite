import type { Plugin } from "vite";

const builtins = [
  "console",
  "path",
  "os",
  "tty",
  "util",
  "assert",
  "events",
  "buffer",
  "string_decoder",
  "fs",
  "stream",
];

interface ResolvedBuiltinModule {
  external: true;
  id: string;
  moduleSideEffects: false;
}

/**
 * Check if a string matches the name of a Node.js builtin module shim provided
 * by Titanium.
 */
export function isBuiltinModule(id: string): boolean {
  return builtins.includes(id);
}

export function resolveNodeBuiltin(
  id: string,
  importer: string | undefined,
  isProduction: boolean,
): ResolvedBuiltinModule | null {
  if (!isBuiltinModule(id)) return null;

  if (isProduction || isTitaniumRuntimeDependency(importer)) {
    return { id, external: true, moduleSideEffects: false };
  }

  return { id: `/titanium:builtin:${id}`, external: true, moduleSideEffects: false };
}

/**
 * Resolves built-in Node core modules provided by Titanium.
 *
 * Production: leave the bare specifier intact and mark it external. Titanium's
 * runtime CJS loader registers its node-compat shims under their bare names
 * (`os`, `path`, …), so the emitted `require("os")` resolves to the platform
 * shim at runtime.
 *
 * Dev: rewrite to `/titanium:builtin:<name>` and mark external. The ModuleRunner
 * transport's `fetchModule` handler recognizes this URL form and returns
 * `{ externalize, type: 'builtin' }`, which causes the runner to delegate
 * resolution to Titanium's runtime `require` via `runExternalModule`.
 */
export function nodeBuiltinsPlugin(): Plugin {
  let isProduction = false;
  return {
    name: "titanium:node-builtins",

    // Enforce as pre plugin so it comes before vite's default resolve plugin
    // which tries to replace Node core modules with empty browser shims
    enforce: "pre",

    configResolved(config) {
      isProduction = config.isProduction;
    },

    resolveId(id, importer) {
      return resolveNodeBuiltin(id, importer, isProduction);
    },
  };
}

function isTitaniumRuntimeDependency(importer: string | undefined): boolean {
  return typeof importer === "string" && importer.includes("/node_modules/tiws/");
}
