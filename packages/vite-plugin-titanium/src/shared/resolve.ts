import path from "node:path";
import type { Platform, ProjectType } from "@titanium-sdk/vite-utils";
import type { Alias, AliasOptions, Plugin } from "vite";

import { FS_PREFIX } from "@titanium-sdk/vite-utils";

export interface ResolvePluginOptions {
  projectType: ProjectType;
  platform: Platform;
}

/**
 * Resolve plugin for Titanium specific resolve rules.
 */
export function resolvePlugin({
  projectType,
}: ResolvePluginOptions): Plugin {
  return {
    name: "titanium:resolve",
    // Enforce as pre plugin so it comes before vite's default resolve plugin
    enforce: "pre",
    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      const sourceRoot =
        projectType === "alloy"
          ? path.join(root, "app")
          : path.join(root, "src");
      config.resolve = {
        ...config.resolve,
        alias: withDefaultTildeAlias(config.resolve?.alias, sourceRoot),
      };
    },
    resolveId(id) {
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
    },
  };
}

function withDefaultTildeAlias(
  alias: AliasOptions | undefined,
  replacement: string,
): AliasOptions {
  if (isAliasArray(alias)) {
    if (alias.some(isTildeAlias)) {
      return alias;
    }
    return [...alias, { find: "~", replacement }];
  }

  if (isAliasRecord(alias) && alias["~"]) {
    return objectAliasesToArray(alias);
  }

  return [
    ...(isAliasRecord(alias) ? objectAliasesToArray(alias) : []),
    { find: "~", replacement },
  ];
}

function isTildeAlias(alias: Alias): boolean {
  return alias.find === "~";
}

function isAliasArray(alias: AliasOptions | undefined): alias is readonly Alias[] {
  return Array.isArray(alias);
}

function isAliasRecord(
  alias: AliasOptions | undefined,
): alias is Record<string, string> {
  return Boolean(alias) && !Array.isArray(alias);
}

function objectAliasesToArray(alias: Record<string, string> | undefined): Alias[] {
  if (!alias) {
    return [];
  }

  return Object.entries(alias).map(([find, replacement]) => ({
    find,
    replacement,
  }));
}
