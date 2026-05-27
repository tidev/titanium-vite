import type { ResolvedConfig } from "vite";
import { BuildEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

const TI_BRIDGE_PLUGIN_NAME = "ti-vite-bridge";

export type TitaniumBuildMode = "app" | "serve-bootstrap";

export function createTitaniumBuildInput(
  mode: TitaniumBuildMode,
): Record<string, string> {
  if (mode === "serve-bootstrap") {
    return {
      "module-runner": "virtual:titanium/module-runner",
    };
  }

  return {
    "module-runner": "virtual:titanium/module-runner",
    main: "virtual:titanium/main",
  };
}

export function createTitaniumBuildEnvironment(
  name: string,
  config: ResolvedConfig,
  mode: TitaniumBuildMode = "app",
) {
  const environmentConfig = config.environments[name];
  const configuredInput = environmentConfig?.build.rollupOptions.input;
  const resolvedMode: TitaniumBuildMode =
    readBridgeCommand(config) === "serve" ||
    isServeBootstrapInput(configuredInput)
      ? "serve-bootstrap"
      : mode;

  const environment = new BuildEnvironment(name, config, {
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
          input: createTitaniumBuildInput(resolvedMode),
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

  if (resolvedMode === "serve-bootstrap") {
    environment.config.build.rollupOptions.input =
      createTitaniumBuildInput(resolvedMode);
  }

  return environment;
}

function isServeBootstrapInput(value: unknown): boolean {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === "module-runner" &&
    "module-runner" in value &&
    value["module-runner"] === "virtual:titanium/module-runner"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBridgeCommand(config: ResolvedConfig): "build" | "serve" | undefined {
  for (const plugin of config.plugins) {
    const command = readBridgeCommandFromPlugin(plugin);
    if (command) return command;
  }
}

function readBridgeCommandFromPlugin(
  value: unknown,
): "build" | "serve" | undefined {
  if (!isRecord(value)) return undefined;
  if (value.name !== TI_BRIDGE_PLUGIN_NAME) return undefined;

  const { api } = value;
  if (!isRecord(api)) return undefined;
  const { context } = api;
  if (!isRecord(context)) return undefined;

  return context.command === "build" || context.command === "serve"
    ? context.command
    : undefined;
}
