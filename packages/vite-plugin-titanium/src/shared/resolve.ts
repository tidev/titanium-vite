import fs from "node:fs";
import path from "path";
import type { Platform, ProjectType } from "@titanium-sdk/vite-utils";
import type { Plugin } from "vite";
import { bareImportRE, FS_PREFIX, otherPlatform } from "@titanium-sdk/vite-utils";
import { normalizePath } from "vite";

export interface ResolvePluginOptions {
  projectType: ProjectType;
  platform: Platform;
}

/**
 * Resolve plugin for Titanium specific resolve rules.
 *
 * - Checks for files inside `android|ios` sub folders
 * - Support bare module and absolute ids as relative to source root
 */
export function resolvePlugin({
  projectType,
  platform,
}: ResolvePluginOptions): Plugin {
  let root: string;
  let projectRoot: string;

  return {
    name: "titanium:resolve",
    // Enforce as pre plugin so it comes before vite's default resolve plugin
    enforce: "pre",
    configResolved(config) {
      projectRoot = config.root;
      root =
        projectType === "alloy"
          ? path.join(config.root, "app")
          : path.join(config.root, "src");
    },
    async resolveId(id, importer) {
      if (
        id.startsWith("\0") ||
        id.startsWith("virtual:") ||
        // When injected directly in html/client code
        id.startsWith("/virtual:")
      ) {
        return;
      }

      // explicit fs paths that starts with /@fs/*
      if (id.startsWith(FS_PREFIX)) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const tryPlatformResolve = async (id: string, base: string) => {
        const result = await this.resolve(path.join(base, id), importer, {
          skipSelf: true,
        });
        if (result) {
          return result.id;
        }
        const platforms = [platform, otherPlatform[platform]];
        for (const platform of platforms) {
          const platformPath = path.join(base, platform, id);
          const result = await this.resolve(platformPath, importer, {
            skipSelf: true,
          });
          if (result) {
            return result.id;
          }
        }
      };

      // FIXME: Implement platform-specific overrides

      /**
       * Fallback to old Titanium behavior of assuming it's actually an absolute path
       *
       * @param id - The id to resolve
       * @param base - The base directory to resolve from
       * @param importer - The importer to resolve from
       * @returns The resolved id or undefined if no match was found
       */
      const tryProjectRootResolve = async (id: string, base: string) => {
        const normalizedId = normalizePath(path.join(base, id));
        const result = await this.resolve(normalizedId, importer, {
          skipSelf: true,
        });
        // TODO: Should we warn if a bare module id was used to resolve to a file in the root?
        // This was supposed to be deprecated and removed in Titanium since 7.0, but never happened
        if (result) {
          return result.id;
        }
      };

      if (bareImportRE.test(id) || id.startsWith("/")) {
        // If the id is already an OS absolute path (under the project root or
        // pointing into node_modules / SDK paths), leave it for the default
        // resolver. `path.join('/app/lib', '/Users/.../foo')` concatenates and
        // produces `<root>/app/lib/Users/.../foo` — every re-entry mangles
        // further, looping forever. Treat the path as "real" if either the
        // file exists OR it's under the project root (covers extensionless
        // requires that the default resolver will resolve next).
        if (
          id.startsWith("/") &&
          path.isAbsolute(id) &&
          (id.startsWith(projectRoot + path.sep) ||
            id.includes(`${path.sep}node_modules${path.sep}`) ||
            fs.existsSync(id))
        ) {
          return;
        }
        const dirs = [];
        if (projectType === "alloy") {
          dirs.push(path.join(root, "lib"), path.join(root, "assets"));
        } else {
          dirs.push(root);
        }
        for (const base of dirs) {
          const result = await tryProjectRootResolve(id, base);
          if (result) {
            return result;
          }
        }
      }
    },
  };
}
