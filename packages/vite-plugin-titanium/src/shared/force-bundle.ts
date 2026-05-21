import { createRequire } from "node:module";
import type { Plugin } from "vite";
import { bareImportRE } from "@titanium-sdk/vite-utils";

type EnvironmentBuiltin = string | RegExp;

/**
 * Force-bundle plugin.
 *
 * Vite 8 ships Rolldown's native `vite-resolve` plugin, which externalizes any
 * bare specifier that resolves into `node_modules`, regardless of
 * `resolve.noExternal`. Titanium has no module loader at runtime, so every
 * npm dependency must be inlined into the bundle.
 *
 * This plugin runs with `enforce: "pre"`, intercepts bare specifiers that are
 * not configured as environment builtins, resolves them to absolute file paths
 * via Node resolution, and returns them as non-external. Rolldown then sees a
 * resolved file path (not a package name) and bundles the file.
 */
export function forceBundlePlugin(): Plugin {
  let projectDir: string;
  return {
    name: "titanium:force-bundle",
    enforce: "pre",

    configResolved(config) {
      projectDir = config.root;
    },

    resolveId(source, importer) {
      if (this.environment.config.command === "serve") return null;
      if (!bareImportRE.test(source)) return null;
      if (isEnvironmentBuiltin(source, this.environment.config.resolve.builtins)) {
        return null;
      }

      const fromDir = importer ?? projectDir;
      const fromRequire = createRequire(`${fromDir}/__noop__.js`);
      try {
        const absPath = fromRequire.resolve(source);
        return { id: absPath, external: false };
      } catch {
        return null;
      }
    },
  };
}

export function isEnvironmentBuiltin(
  id: string,
  builtins: readonly EnvironmentBuiltin[],
): boolean {
  return builtins.some((builtin) =>
    typeof builtin === "string" ? builtin === id : builtin.test(id),
  );
}
