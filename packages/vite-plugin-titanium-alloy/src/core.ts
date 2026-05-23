import { createRequire } from "node:module";
import path from "node:path";
import type { Platform } from "@titanium-sdk/vite-utils";
import type { DepOptimizationConfig, Plugin } from "vite";
import type { RolldownPlugin } from "rolldown";
import { cleanUrl } from "@titanium-sdk/vite-utils";

import { createAlloyConfigCode } from "./config.js";
import type { AlloyContext } from "./context.js";

const require = createRequire(import.meta.url);

const DEFAULT_BACKBONE_VERSION = "0.9.2";
const ALLOY_OPTIMIZE_DEPS_INCLUDE = ["alloy/Alloy/template/lib/alloy.js"];
const ALLOY_OPTIMIZE_DEPS_EXCLUDE = ["alloy.bootstrap"];
const ALLOY_CONFIG = "/alloy/CFG";
const ALLOY_OPTIMIZER_CONFIG = "\0titanium:alloy:optimizer-config";

const appControllerRequestPattern = "'/alloy/controllers/' \\+ ";
const widgetControllerRequestPattern =
  "'/alloy/widgets/'.*?'/controllers/' \\+ ";

interface AlloyServerFsAllowOptions {
  existing: string[];
  appDir: string;
  alloyRoot: string;
  alloyUtilsRoot: string;
}

interface AlloyAliasOptions {
  appDir: string;
  alloyMain: string;
  alloyRoot: string;
  alloyUtilsRoot: string;
  backboneVersion: string;
}

interface AlloyResolveAlias {
  find: RegExp;
  replacement: string;
}

interface AlloyOptimizerAlias {
  find: string;
  replacement: string;
}

interface AlloyAliasEntry {
  resolve: AlloyResolveAlias;
  optimizeDeps?: AlloyOptimizerAlias;
}

interface AlloyAliases {
  resolve: AlloyResolveAlias[];
  optimizeDeps: Record<string, string>;
}

type OptimizeDepsRolldownOptions = NonNullable<
  DepOptimizationConfig["rolldownOptions"]
>;

interface AlloyOptimizeDepsRolldownOptions {
  existing?: OptimizeDepsRolldownOptions;
  aliases: Record<string, string>;
  plugin: RolldownPlugin;
  platform?: OptimizeDepsRolldownOptions["platform"];
}

interface ViteResolveAlias {
  find: string | RegExp;
  replacement: string;
}

function isViteResolveAlias(value: unknown): value is ViteResolveAlias {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("find" in value) || !("replacement" in value)) {
    return false;
  }
  const { find, replacement } = value;
  return (
    (typeof find === "string" || find instanceof RegExp) &&
    typeof replacement === "string"
  );
}

export function createAlloyResolveAliases(
  existing: unknown,
  aliases: AlloyResolveAlias[],
): ViteResolveAlias[] {
  if (!Array.isArray(existing)) {
    return aliases;
  }
  return [...existing.filter(isViteResolveAlias), ...aliases];
}

export function createAlloyServerFsAllow({
  existing,
  appDir,
  alloyRoot,
  alloyUtilsRoot,
}: AlloyServerFsAllowOptions): string[] {
  return [...existing, appDir, alloyRoot, alloyUtilsRoot];
}

export function createAlloyOptimizeDepsExclude(existing: string[]): string[] {
  return [...existing, ...ALLOY_OPTIMIZE_DEPS_EXCLUDE];
}

export function createAlloyOptimizeDepsInclude(existing: string[]): string[] {
  return [...existing, ...ALLOY_OPTIMIZE_DEPS_INCLUDE];
}

export function createAlloyOptimizeDepsRolldownOptions({
  existing,
  aliases,
  plugin,
  platform,
}: AlloyOptimizeDepsRolldownOptions): OptimizeDepsRolldownOptions {
  return {
    ...existing,
    ...(platform ? { platform } : {}),
    resolve: {
      ...existing?.resolve,
      alias: {
        ...existing?.resolve?.alias,
        ...aliases,
      },
    },
    plugins: [existing?.plugins, plugin],
  };
}

export function createAlloyAliases({
  appDir,
  alloyMain,
  alloyRoot,
  alloyUtilsRoot,
  backboneVersion,
}: AlloyAliasOptions): AlloyAliases {
  const backbone = path.join(
    alloyRoot,
    "lib/alloy/backbone",
    backboneVersion,
    "backbone.js",
  );
  const constants = path.join(alloyUtilsRoot, "constants.js");
  const underscore = path.resolve(alloyRoot, "lib/alloy/underscore.js");
  const entries: AlloyAliasEntry[] = [
    {
      resolve: {
        find: /^\/?alloy$/,
        replacement: alloyMain,
      },
    },
    {
      resolve: {
        find: /^\/?alloy\/backbone$/,
        replacement: backbone,
      },
      optimizeDeps: {
        find: "/alloy/backbone",
        replacement: backbone,
      },
    },
    {
      resolve: {
        find: /^\/?alloy\/constants$/,
        replacement: constants,
      },
      optimizeDeps: {
        find: "/alloy/constants",
        replacement: constants,
      },
    },
    {
      resolve: {
        find: /^\/?alloy\/models/,
        replacement: path.join(appDir, "models"),
      },
    },
    {
      resolve: {
        find: /^\/?alloy\/styles/,
        replacement: path.join(appDir, "styles"),
      },
    },
    {
      resolve: {
        find: /^\/?alloy\/widgets/,
        replacement: path.join(appDir, "widgets"),
      },
    },
    {
      resolve: {
        find: /^\/?alloy\/(animation|dialogs|measurement|moment|sha1|social|string)/,
        replacement: path.resolve(alloyRoot, "builtins/$1"),
      },
    },
    {
      resolve: {
        find: /^\/?alloy\/(sync|underscore|widget|controllers\/BaseController)/,
        replacement: path.resolve(alloyRoot, "lib/alloy/$1"),
      },
      optimizeDeps: {
        find: "/alloy/underscore",
        replacement: underscore,
      },
    },
    {
      resolve: {
        find: /^alloy.bootstrap$/,
        replacement: path.join(alloyRoot, "template/alloy.bootstrap.js"),
      },
    },
  ];
  const optimizeDeps: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.optimizeDeps) {
      optimizeDeps[entry.optimizeDeps.find] = entry.optimizeDeps.replacement;
    }
  }
  return {
    resolve: entries.map((entry) => entry.resolve),
    optimizeDeps,
  };
}

function alloyOptimizerConfigPlugin(ctx: AlloyContext): RolldownPlugin {
  return {
    name: "titanium:alloy:optimizer-config",
    resolveId(id) {
      if (id === ALLOY_CONFIG) {
        return ALLOY_OPTIMIZER_CONFIG;
      }
    },
    load(id) {
      if (id === ALLOY_OPTIMIZER_CONFIG) {
        return createAlloyConfigCode(ctx);
      }
    },
  };
}

export function corePlugin(ctx: AlloyContext, platform: Platform): Plugin {
  const { root: alloyRoot } = ctx;
  const ALLOY_MAIN = path.join(alloyRoot, "template/lib/alloy.js");
  const ALLOY_WIDGET = path.join(alloyRoot, "lib/alloy/widget.js");
  const ALLOY_UTILS_ROOT = path.dirname(require.resolve("alloy-utils"));

  return {
    name: "titanium:alloy:core",

    config(config) {
      const { appDir, root: alloyRoot, compiler } = ctx;
      const compileConfig = compiler.config;
      const backboneVersion = compileConfig.backbone
        ? compileConfig.backbone
        : DEFAULT_BACKBONE_VERSION;
      const alloyAliases = createAlloyAliases({
        appDir,
        alloyMain: ALLOY_MAIN,
        alloyRoot,
        alloyUtilsRoot: ALLOY_UTILS_ROOT,
        backboneVersion,
      });
      if (!config.resolve) {
        config.resolve = {};
      }
      config.resolve.alias = createAlloyResolveAliases(
        config.resolve.alias,
        alloyAliases.resolve,
      );

      config.define = {
        ...config.define,
        ALLOY_VERSION: JSON.stringify("1.0.0"),
        ENV_DEV: true,
        ENV_DEVELOPMENT: true,
        ENV_TEST: false,
        ENV_PROD: false,
        ENV_PRODUCTION: false,
        OS_MOBILEWEB: false,
        DIST_ADHOC: false,
        DIST_STORE: false,
      };

      if (!config.optimizeDeps) {
        config.optimizeDeps = {};
      }
      // Vite 8 disabled extglobs in dev for consistency with Rolldown's
      // glob enumeration, so the previous `!(android)` / `@(j|t)s` patterns
      // no longer match. Enumerate the active platform's overrides plus the
      // shared (non-platform) tree explicitly. Scanning the other platform's
      // files would only add prebundle work, not correctness errors, but
      // the explicit form documents intent.
      config.optimizeDeps.entries = [
        ...(config.optimizeDeps.entries ?? []),
        `controllers/*.{js,ts}`,
        `controllers/${platform}/**/*.{js,ts}`,
        `lib/*.{js,ts}`,
        `lib/${platform}/**/*.{js,ts}`,
      ];
      config.optimizeDeps.include = createAlloyOptimizeDepsInclude(
        config.optimizeDeps.include ?? [],
      );
      config.optimizeDeps.exclude = createAlloyOptimizeDepsExclude(
        config.optimizeDeps.exclude ?? [],
      );
      config.optimizeDeps.rolldownOptions =
        createAlloyOptimizeDepsRolldownOptions({
          aliases: alloyAliases.optimizeDeps,
          existing: config.optimizeDeps.rolldownOptions,
          plugin: alloyOptimizerConfigPlugin(ctx),
        });
      const titaniumOptimizeDeps =
        config.environments?.titanium?.optimizeDeps;
      config.environments = {
        ...config.environments,
        titanium: {
          ...config.environments?.titanium,
          optimizeDeps: {
            ...titaniumOptimizeDeps,
            include: createAlloyOptimizeDepsInclude(
              titaniumOptimizeDeps?.include ?? [],
            ),
            exclude: createAlloyOptimizeDepsExclude(
              titaniumOptimizeDeps?.exclude ?? [],
            ),
            rolldownOptions: createAlloyOptimizeDepsRolldownOptions({
              aliases: alloyAliases.optimizeDeps,
              existing: titaniumOptimizeDeps?.rolldownOptions,
              plugin: alloyOptimizerConfigPlugin(ctx),
              // Titanium has a global CommonJS `require`, but it is not Node
              // and cannot resolve `node:` specifiers. Keep optimizer helpers
              // target-neutral so CJS deps use the runtime `require` instead
              // of importing `node:module` for `createRequire`.
              platform: "neutral",
            }),
          },
        },
      };

      config.server = {
        ...config.server,
        fs: {
          ...config.server?.fs,
          allow: createAlloyServerFsAllow({
            existing: config.server?.fs?.allow ?? [],
            appDir,
            alloyRoot,
            alloyUtilsRoot: ALLOY_UTILS_ROOT,
          }),
        },
      };
    },

    resolveId(id, importer) {
      if (id === "jquery" && importer?.includes("/backbone.js")) {
        // backbone includes an unused require to `jquery` that needs to be
        // marked as external so vite does not try to handle it
        return { id, external: true };
      }
    },

    transform(code, id) {
      const cleanId = cleanUrl(id);
      if (cleanId === ALLOY_MAIN || cleanId === ALLOY_WIDGET) {
        return patchForViteCompatibility(code);
      }
    },
  };
}

/**
 * Applies various patches in the given content to be compatible with Vite.
 *
 * @param content File content to modify
 */
function patchForViteCompatibility(content: string) {
  // Controller modules are ESM-shaped in dev, but production CJS chunks expose
  // the constructor directly once entry exports are preserved.
  content = requireControllerExport(content, appControllerRequestPattern);
  content = requireControllerExport(content, widgetControllerRequestPattern);

  content = content
    // /alloy/CFG is an ESM virtual module in Vite.
    .replace(
      "exports.CFG = require('/alloy/CFG');",
      "exports.CFG = require('/alloy/CFG').default;",
    )
    // remove ucfirst in model/collection requires
    .replace(/models\/'\s\+\sucfirst\(name\)/g, "models/' + name")
    // remove double slash in controller requires
    .replace(/(controllers\/' \+ \(?)(name)/g, "$1$2?.replace(/^\\//, '')");

  return content;
}

/**
 * Modifies controller require statements to use ESM default exports when present.
 *
 * @param content Content string to search in.
 * @param requestFilter RegExp to filter for specific requires.
 */
function requireControllerExport(content: string, requestFilter: string) {
  const searchPattern = new RegExp(
    `(require\\(${requestFilter})(\\(?name(?: \\|\\| DEFAULT_WIDGET\\))?)(\\))`,
    "g",
  );
  return content.replace(
    searchPattern,
    "(function (__alloyViteController) { return __alloyViteController && __alloyViteController.__esModule && __alloyViteController.default ? __alloyViteController.default : __alloyViteController; })($1$2.replace(/^\\.?\\//, '')$3)",
  );
}
