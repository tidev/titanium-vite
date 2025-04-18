import type { Plugin } from "vite";
import { createTitaniumEnvironment } from "vite-titanium-environment";

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
        appType: "custom",
        build: {
          outDir: "Resources",
        },
        builder: {
          buildApp: async (builder) => {
            // Vite comes with client and ssr environemnts by default which we don't need,
            // so we only build the titanium environment
            const environment = builder.environments.titanium;
            if (!environment) {
              throw new Error("Titanium environment not found");
            }
            await builder.build(environment);
          },
        },
        environments: {
          titanium: createTitaniumEnvironment({}),
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
