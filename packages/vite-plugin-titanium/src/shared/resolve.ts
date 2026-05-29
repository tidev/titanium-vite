import path from "node:path";
import type { Platform, ProjectType } from "@titanium-sdk/vite-utils";
import type { Alias, AliasOptions, Plugin } from "vite";

import { cleanUrl, FS_PREFIX } from "@titanium-sdk/vite-utils";

export interface ResolvePluginOptions {
  projectType: ProjectType;
  platform: Platform;
}

/**
 * Resolve plugin for Titanium specific resolve rules.
 */
export function resolvePlugin({
  projectType,
  platform,
}: ResolvePluginOptions): Plugin {
  let sourceRootPath: string;

  return {
    name: "titanium:resolve",
    // Enforce as pre plugin so it comes before vite's default resolve plugin
    enforce: "pre",
    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      sourceRootPath =
        projectType === "alloy"
          ? path.join(root, "app")
          : path.join(root, "src");
      config.resolve = {
        ...config.resolve,
        alias: withDefaultTildeAlias(config.resolve?.alias, sourceRootPath),
      };
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

      const platformCandidate = createPlatformCandidate({
        id,
        importer,
        platform,
        sourceRoot: sourceRootPath,
      });
      if (!platformCandidate) {
        return;
      }

      const result = await this.resolve(platformCandidate, importer, {
        skipSelf: true,
      });
      return result?.id;
    },
  };
}

interface PlatformCandidateOptions {
  id: string;
  importer: string | undefined;
  platform: Platform;
  sourceRoot: string;
}

function createPlatformCandidate({
  id,
  importer,
  platform,
  sourceRoot,
}: PlatformCandidateOptions): string | undefined {
  const cleanId = cleanUrl(id);
  if (hasExplicitExtension(cleanId)) {
    return undefined;
  }

  const query = id.slice(cleanId.length);
  const resolvedId = resolveAppSourceId(cleanId, importer, sourceRoot);
  if (!resolvedId) {
    return undefined;
  }

  return `${resolvedId}.${platform}${query}`;
}

function resolveAppSourceId(
  id: string,
  importer: string | undefined,
  sourceRoot: string,
): string | undefined {
  if (id.startsWith("~/")) {
    return path.join(sourceRoot, id.slice(2));
  }

  if (path.isAbsolute(id) && isWithinSourceRoot(id, sourceRoot)) {
    return id;
  }

  if (!id.startsWith(".") || !importer) {
    return undefined;
  }

  const cleanImporter = cleanUrl(importer);
  if (!path.isAbsolute(cleanImporter)) {
    return undefined;
  }

  const resolvedId = path.resolve(path.dirname(cleanImporter), id);
  return isWithinSourceRoot(resolvedId, sourceRoot) ? resolvedId : undefined;
}

function hasExplicitExtension(id: string): boolean {
  return path.extname(path.basename(id)) !== "";
}

function isWithinSourceRoot(id: string, sourceRoot: string): boolean {
  const relative = path.relative(sourceRoot, id);
  return (
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
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
