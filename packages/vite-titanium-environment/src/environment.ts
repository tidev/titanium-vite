import type { EnvironmentOptions, ResolvedConfig } from "vite";
import { mergeConfig } from "vite";

import { createTitaniumBuildEnvironment } from "./build.js";
import { createTitaniumDevEnvironment } from "./dev.js";

export function createTitaniumEnvironment(
  userConfig: EnvironmentOptions = {},
): EnvironmentOptions {
  return mergeConfig(
    {
      dev: {
        createEnvironment(name: string, config: ResolvedConfig) {
          return createTitaniumDevEnvironment(name, config, { hot: false });
        },
      },
      build: {
        createEnvironment(name: string, config: ResolvedConfig) {
          return createTitaniumBuildEnvironment(name, config);
        },
      },
    },
    userConfig,
  );
}
