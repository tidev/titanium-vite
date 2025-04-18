import type { Plugin } from "vite";

import type { Platform, ProjectType } from "./types.js";
import { classicPlugin } from "./classic/index.js";
import { nodeBuiltinsPlugin } from "./node-builtins.js";
import { resolvePlugin } from "./resolve.js";

export interface TitaniumOptions {
  projectType: ProjectType;
}

export function titanium(options: TitaniumOptions) {
  const { projectType } = options;

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const platform = process.env.TITANIUM_BUILD_PLATFORM;
  validatePlatform(platform);

  const titaniumConfigPlugin: Plugin = {
    name: "titanium:base-config",
    config() {
      return {
        build: {
          outDir: "Resources",
        },
      };
    },
  };

  const sharedPlugins = [
    titaniumConfigPlugin,
    nodeBuiltinsPlugin(),
    resolvePlugin({ projectType, platform }),
  ];

  const projectPlugins =
    projectType === "classic" ? classicPlugin({ platform }) : [];

  return [...sharedPlugins, ...projectPlugins];
}

function validatePlatform(platform?: string): asserts platform is Platform {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Invalid platform: ${platform}`);
  }
}
