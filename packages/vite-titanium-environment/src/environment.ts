import type { EnvironmentOptions, ResolvedConfig } from "vite";
import { mergeConfig } from "vite";

import { createTitaniumBuildEnvironment } from "./build.js";

export function createTitaniumEnvironment(
  userConfig: EnvironmentOptions,
): EnvironmentOptions {
  return mergeConfig(
    {
      build: {
        createEnvironment(name: string, config: ResolvedConfig) {
          return createTitaniumBuildEnvironment(name, config);
        },
      },
    },
    userConfig,
  );
}
