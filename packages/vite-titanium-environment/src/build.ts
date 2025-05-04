import type { ResolvedConfig } from "vite";
import { BuildEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

export function createTitaniumBuildEnvironment(
  name: string,
  config: ResolvedConfig,
) {
  return new BuildEnvironment(name, config, {
    options: {
      consumer: "client",
      build: {
        target: "es2020",
        modulePreload: {
          polyfill: false,
        },
        outDir: "Resources",
        rollupOptions: {
          input: ["virtual:titanium/app", "virtual:titanium/polyfills"],
          output: {
            entryFileNames: (chunk) => {
              if (chunk.name === "polyfills") {
                return "polyfills.bootstrap.js";
              }
              return `${chunk.name}.js`;
            },
            format: "cjs",
          },
        },
      },
      resolve: {
        builtins: [...nodeCompatBuiltins],
        external: [...nodeCompatBuiltins],
      },
    },
  });
}
