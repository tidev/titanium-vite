import type { Platform, ProjectType } from "./types.js";
import { classicPlugin } from "./classic/index.js";
import { corePlugin } from "./shared/core.js";
import { virtualEntryPlugin } from "./shared/entry.js";
import { nodeBuiltinsPlugin } from "./shared/node-builtins.js";
import { resolvePlugin } from "./shared/resolve.js";

export interface TitaniumOptions {
  projectType: ProjectType;
}

export function titanium(options: TitaniumOptions) {
  const { projectType } = options;

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const platform = process.env.TITANIUM_BUILD_PLATFORM;
  validatePlatform(platform);

  const sharedPlugins = [
    corePlugin(),
    virtualEntryPlugin(),
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
