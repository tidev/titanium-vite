import type { EnvironmentOptions, ResolvedConfig, WebSocketServer } from "vite";
import { mergeConfig } from "vite";

import { createTitaniumBuildEnvironment } from "./build.js";
import { createTitaniumDevEnvironment } from "./dev.js";
import { createTitaniumHotTransport } from "./hot.js";

export function createTitaniumEnvironment(
  userConfig: EnvironmentOptions = {},
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
          return createTitaniumBuildEnvironment(name, config);
        },
      },
    },
    userConfig,
  );
}
