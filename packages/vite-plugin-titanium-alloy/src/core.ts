import { createRequire } from "node:module";
import path from "node:path";
import type { Platform } from "@titanium/vite-utils";
import type { Plugin } from "vite";
import { cleanUrl } from "@titanium/vite-utils";

import type { AlloyContext } from "./context.js";

const require = createRequire(import.meta.url);

const DEFAULT_BACKBONE_VERSION = "0.9.2";

const appControllerRequestPattern = "'/alloy/controllers/' \\+ ";
const widgetControllerRequestPattern =
  "'/alloy/widgets/'.*?'/controllers/' \\+ ";

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
      if (!config.resolve) {
        config.resolve = {};
      }
      config.resolve.alias = [
        ...(Array.isArray(config.resolve.alias) ? config.resolve.alias : []),
        {
          find: /^\/?alloy$/,
          replacement: ALLOY_MAIN,
        },
        {
          find: /^\/?alloy\/backbone$/,
          replacement: path.join(
            alloyRoot,
            "lib/alloy/backbone",
            backboneVersion,
            "backbone.js",
          ),
        },
        {
          find: /^\/?alloy\/constants$/,
          replacement: path.join(ALLOY_UTILS_ROOT, "constants.js"),
        },
        {
          find: /^\/?alloy\/models/,
          replacement: path.join(appDir, "models"),
        },
        {
          find: /^\/?alloy\/styles/,
          replacement: path.join(appDir, "styles"),
        },
        {
          find: /^\/?alloy\/widgets/,
          replacement: path.join(appDir, "widgets"),
        },
        {
          find: /^\/?alloy\/(animation|dialogs|measurement|moment|sha1|social|string)/,
          replacement: path.resolve(alloyRoot, "builtins/$1"),
        },
        {
          find: /^\/?alloy\/(sync|underscore|widget|controllers\/BaseController)/,
          replacement: path.resolve(alloyRoot, "lib/alloy/$1"),
        },
        {
          find: /^alloy.bootstrap$/,
          replacement: path.join(alloyRoot, "template/alloy.bootstrap.js"),
        },
      ];

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
      config.optimizeDeps.exclude = [
        ...(config.optimizeDeps.exclude ?? []),
        "alloy.bootstrap",
      ];

      config.server = {
        ...config.server,
        fs: {
          ...config.server?.fs,
          allow: [
            ...(config.server?.fs?.allow ?? []),
            alloyRoot,
            ALLOY_UTILS_ROOT,
          ],
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
