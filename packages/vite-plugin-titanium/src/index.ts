import type { Platform, ProjectType } from "@titanium/vite-utils";
import type { Plugin } from "vite";
import { moduleRunnerTransform } from "vite";

import { classicPlugin } from "./classic/index.js";
import { corePlugin } from "./shared/core.js";
import { moduleRunnerPlugin } from "./shared/module-runner.js";
import { nodeBuiltinsPlugin } from "./shared/node-builtins.js";
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
    nodeBuiltinsPlugin(),
    resolvePlugin({ projectType, platform }),
    tiSymbolsPlugin(),
  ];

  const projectPlugins =
    projectType === "classic" ? classicPlugin({ platform }) : [];

  const moduleRunnerTransformPlugin: Plugin = {
    name: "titanium:module-runner-transform",
    enforce: "post",
    async renderChunk(code, chunk) {
      if (chunk.fileName === "app.js") {
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
