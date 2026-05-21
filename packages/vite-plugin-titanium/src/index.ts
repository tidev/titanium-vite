import type { Platform, ProjectType } from "@titanium-sdk/vite-utils";
import type { Plugin } from "vite";
import { moduleRunnerTransform } from "vite";

import { resolveAlloyPlugins } from "@titanium-sdk/vite-plugin-titanium-alloy";

import { classicPlugin } from "./classic/index.js";
import { corePlugin } from "./shared/core.js";
import { forceBundlePlugin } from "./shared/force-bundle.js";
import { moduleRunnerPlugin } from "./shared/module-runner.js";
import { nativeModulesPlugin } from "./shared/native-modules.js";
import { polyfillsPlugin } from "./shared/polyfills.js";
import { resolvePlugin } from "./shared/resolve.js";
import { tiSymbolsPlugin } from "./shared/ti-symbols.js";

export interface TitaniumOptions {
  projectType: ProjectType;
  platform?: Platform;
}

export function titanium(options: TitaniumOptions) {
  const { projectType } = options;

  const platform = options.platform ?? "ios";
  validatePlatform(platform);

  const sharedPlugins = [
    corePlugin(),
    moduleRunnerPlugin(),
    polyfillsPlugin(),
    nativeModulesPlugin(),
    forceBundlePlugin(),
    resolvePlugin({ projectType, platform }),
    tiSymbolsPlugin(),
  ];

  const projectPlugins =
    projectType === "classic"
      ? classicPlugin({ platform })
      : resolveAlloyPlugins(process.cwd(), platform);

  // moduleRunnerTransform rewrites ESM imports into `__vite_ssr_import__` calls so
  // Vite's ModuleRunner can fetch modules at runtime. This is a dev-mode concern;
  // production builds emit CJS bundles that Titanium's native loader handles directly.
  let isProduction = false;
  const moduleRunnerTransformPlugin: Plugin = {
    name: "titanium:module-runner-transform",
    enforce: "post",
    configResolved(config) {
      isProduction = config.isProduction;
    },
    async renderChunk(code, chunk) {
      if (isProduction || chunk.fileName === "app.js") {
        return null;
      }

      const result = await moduleRunnerTransform(
        code,
        { mappings: "" },
        chunk.name,
        code,
      );

      return result?.code;
    },
  };

  return [...sharedPlugins, ...projectPlugins, moduleRunnerTransformPlugin];
}

function validatePlatform(platform?: string): asserts platform is Platform {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Invalid platform: ${platform}`);
  }
}
