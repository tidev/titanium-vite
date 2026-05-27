import type { EnvironmentOptions, ResolvedConfig, WebSocketServer } from "vite";
import { mergeConfig } from "vite";

import { createTitaniumBuildEnvironment } from "./build.js";
import type { TitaniumBuildMode } from "./build.js";
import {
  createTitaniumDevEnvironment,
  createTitaniumDevEnvironmentOptions,
} from "./dev.js";
import { createTitaniumHotTransport } from "./hot.js";

type TitaniumBuildModeResolver = TitaniumBuildMode | (() => TitaniumBuildMode);

export function createTitaniumEnvironment(
  userConfig: EnvironmentOptions = {},
  buildMode: TitaniumBuildModeResolver = "app",
): EnvironmentOptions {
  return mergeConfig(
    {
      dev: {
        createEnvironment(
          name: string,
          config: ResolvedConfig,
          context: { ws: WebSocketServer },
        ) {
          return createTitaniumDevEnvironment(name, config, {
            hot: true,
            transport: createTitaniumHotTransport(context.ws),
          });
        },
      },
      build: {
        createEnvironment(name: string, config: ResolvedConfig) {
          return createTitaniumBuildEnvironment(
            name,
            config,
            resolveBuildMode(buildMode),
          );
        },
      },
    },
    createTitaniumDevEnvironmentOptions(userConfig),
  );
}

function resolveBuildMode(buildMode: TitaniumBuildModeResolver): TitaniumBuildMode {
  return typeof buildMode === "function" ? buildMode() : buildMode;
}
