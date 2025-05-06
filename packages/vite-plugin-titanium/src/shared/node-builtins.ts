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

/**
 * Check if a string matches the name of a Node.js builtin module shim provided
 * by Titanium.
 */
export function isBuiltinModule(id: string): boolean {
  return builtins.includes(id);
}

/**
 * Resolves built-in Node core modules provided by Titanium
 */
export function nodeBuiltinsPlugin(): Plugin {
  return {
    name: "titanium:node-builtins",

    // Enforce as pre plugin so it comes before vite's default resolve plugin
    // which tries to replace Node core modules with empty browser shims
    enforce: "pre",

    resolveId(id) {
      if (isBuiltinModule(id)) {
        return { id, external: true, moduleSideEffects: false };
      }
    },
  };
}
