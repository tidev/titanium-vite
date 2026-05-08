import type { ResolvedConfig } from "vite";
import { BuildEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

export function createTitaniumBuildEnvironment(
  name: string,
  config: ResolvedConfig,
) {
  return new BuildEnvironment(name, config, {
    options: {
      consumer: "server",
      build: {
        target: "ios13",
        modulePreload: {
          polyfill: false,
        },
        outDir: "Resources",
        copyPublicDir: false,
        rolldownOptions: {
          input: ["virtual:titanium/module-runner", "virtual:titanium/main"],
          output: {
            entryFileNames: (chunk) => {
              if (chunk.name === "module-runner") {
                return 'app.js'
              }
              if (chunk.name === "polyfills") {
                return "polyfills.bootstrap.js";
              }
              return `${chunk.name}.js`;
            },
          },
        },
      },
      resolve: {
        // We want to bundle everything in the app so we prevent all dependencies from being externalized
        noExternal: true,
        builtins: [...nodeCompatBuiltins],
        external: [...nodeCompatBuiltins],
      },
    },
  });
}
