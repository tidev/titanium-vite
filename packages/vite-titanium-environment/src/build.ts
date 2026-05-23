import type { ResolvedConfig } from "vite";
import { BuildEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

export function createTitaniumBuildEnvironment(
  name: string,
  config: ResolvedConfig,
) {
  return new BuildEnvironment(name, config, {
    options: {
      // Titanium is a custom runtime, not a browser target. Use Vite's server
      // consumer path so builtins/externalization use runtime-oriented semantics,
      // then force npm dependencies through the bundle because Titanium has no
      // npm module loader at runtime.
      consumer: "server",
      build: {
        target: "ios13",
        modulePreload: {
          polyfill: false,
        },
        outDir: "Resources",
        copyPublicDir: false,
        rolldownOptions: {
          // Titanium is a custom JS runtime — neither node nor browser. "neutral" stops
          // Rolldown from auto-externalizing `node:*` and other host-specific specifiers.
          platform: "neutral",
          // Use the object form so chunk names are explicit and stable for
          // `entryFileNames` to dispatch on. Object form also lets plugins
          // (e.g. alloy controller/widget/model entries) merge inputs without
          // colliding with Vite's array-concatenation merge semantics.
          input: {
            "module-runner": "virtual:titanium/module-runner",
            main: "virtual:titanium/main",
          },
          preserveEntrySignatures: "exports-only",
          output: {
            // Titanium's runtime evaluates files via JavaScriptCore in script context
            // (`JSEvaluateScript`) and provides a CommonJS-style `require` global.
            // Static `import` statements are a SyntaxError; `module.exports`/`require()`
            // are the supported module format. Emit CJS so app.js and shared chunks
            // wire up through `require()` instead of ESM `import`.
            format: "cjs",
            entryFileNames: (chunk) => {
              if (chunk.name === "module-runner") {
                return "app.js";
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
        // Titanium has no module loader at runtime — every npm dep must be bundled.
        noExternal: true,
        builtins: [...nodeCompatBuiltins],
        external: [...nodeCompatBuiltins],
      },
    },
  });
}
