import type { ResolvedConfig } from "vite";
import { BuildEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

export function createTitaniumBuildEnvironment(
  name: string,
  config: ResolvedConfig,
) {
  return new BuildEnvironment(name, config, {
    options: {
      // Use the client consumer so Vite's native resolver bundles npm dependencies
      // by default (browser-style). With "server" + platform="neutral" the native
      // vite-resolve plugin still externalizes anything resolved from node_modules,
      // even when `resolve.noExternal: true` is set.
      consumer: "client",
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
          output: {
            // Titanium's runtime evaluates files via JavaScriptCore in script context
            // (`JSEvaluateScript`) and provides a CommonJS-style `require` global.
            // Static `import` statements are a SyntaxError; `module.exports`/`require()`
            // are the supported module format. Emit CJS so app.js and shared chunks
            // wire up through `require()` instead of ESM `import`.
            format: "cjs",
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
        // Titanium has no module loader at runtime — every npm dep must be bundled.
        // Rolldown's native `vite-resolve` plugin honors `noExternal` only when it's
        // a regex/array (not `true`), so use a catch-all regex to force bundling of
        // every bare specifier that gets resolved to node_modules.
        noExternal: [/.*/],
        builtins: [...nodeCompatBuiltins],
        external: [...nodeCompatBuiltins],
      },
    },
  });
}
