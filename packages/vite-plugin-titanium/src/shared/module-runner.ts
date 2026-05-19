import { createRequire } from "node:module";
import type { Plugin } from "vite";
import { TI_BRIDGE_PLUGIN_NAME } from "@titanium-sdk/vite-utils";

const require = createRequire(import.meta.url);

const VIRTUAL_ENTRY_ID = 'virtual:titanium/module-runner'

export function moduleRunnerPlugin(): Plugin {
  let isProduction = false
  let devServerOrigin: string | undefined

  return {
    name: "titanium:module-runner",
    enforce: "pre",

    configResolved(config) {
      isProduction = config.isProduction
      const bridgePlugin = config.plugins.find(
        (p) => p.name === TI_BRIDGE_PLUGIN_NAME,
      );
      if (!bridgePlugin) return;

      const bridge = parseBridgeApi(bridgePlugin.api);
      if (!bridge) return;

      isProduction = config.isProduction && bridge.context.command !== "serve";
      devServerOrigin = bridge.context.devServer?.origin;
    },

    resolveId(source) {
      if (source === VIRTUAL_ENTRY_ID) {
        return `\0${source}`;
      }
      // Vite 8's builtin vite-resolve plugin externalizes `vite/module-runner`
      // because it resolves into node_modules. Titanium has no module loader at
      // runtime, so the runner must be inlined. Bypass the builtin resolver by
      // returning the absolute file path ourselves — Rolldown will then bundle it.
      if (source === "vite/module-runner") {
        return require.resolve("vite/module-runner");
      }
      // `app.js` (built from the runner virtual entry) ends with `require('./main.js')`,
      // which is the OTHER build entry (built from `virtual:titanium/main`). Rolldown
      // cannot resolve that cross-entry require at build time, so mark it external and
      // let Titanium's runtime CJS loader resolve it via the emitted asset.
      if (isProduction && source === "./main.js") {
        return { id: "./main.js", external: true };
      }
      return null;
    },

    load(id) {
      if (id !== `\0${VIRTUAL_ENTRY_ID}`) return;

      // Production: everything user-facing is already bundled into main.js as CJS.
      // app.js just needs to load main.js — Titanium's CJS loader handles the rest.
      if (isProduction) {
        return { code: `require('./main.js');\n` };
      }

      if (!devServerOrigin) {
        throw new Error(
          "Titanium dev server origin missing from Vite bridge context.",
        );
      }

      // Development: stand up Vite's ModuleRunner so the dev server can transform
      // and stream modules on demand. Loaded into Titanium via the script-mode
      // bootstrap; static `import` would SyntaxError, so this code goes through
      // Rolldown's CJS output (which converts the bare `import` below into a
      // `require()` against the vite/module-runner file inlined by the bundler).
      return {
        code: `import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

const devServerOrigin = ${JSON.stringify(devServerOrigin)};

class TitaniumModulesEvaluator extends ESModulesEvaluator {
  runExternalModule(filepath) {
    const mod = require(filepath);
    return (mod && mod.__esModule) ? mod : { "default": mod };
  }
}

function postInvoke(payload) {
  const builtinFetch = resolveBuiltinFetch(payload);
  if (builtinFetch) {
    return Promise.resolve({ result: builtinFetch });
  }

  return new Promise((resolve, reject) => {
    const client = Ti.Network.createHTTPClient({
      onload() {
        try {
          resolve(JSON.parse(this.responseText));
        } catch (e) {
          reject(e);
        }
      },
      onerror(e) {
        reject(e);
      },
    });

    client.open("POST", devServerOrigin + "/invoke");
    client.setRequestHeader("content-type", "application/json");
    client.send(JSON.stringify(payload));
  });
}

function resolveBuiltinFetch(payload) {
  const data = payload && payload.data && payload.data.data;
  if (!data || payload.data.name !== "fetchModule") {
    return null;
  }

  const url = data[0];
  if (typeof url !== "string" || !url.startsWith("/titanium:builtin:")) {
    return null;
  }

  return {
    externalize: url.slice("/titanium:builtin:".length),
    type: "builtin",
  };
}

const moduleRunner = new ModuleRunner(
  {
    transport: {
      invoke(payload) {
        return postInvoke(payload);
      },
    },
    hmr: false,
  },
  new TitaniumModulesEvaluator(),
);

(async () => {
  try {
    await moduleRunner.import('virtual:titanium/main');
  } catch (e) {
    console.log('[titanium] module runner import failed', e);
  }
})();
`,
      };
    },
  }
}

interface ModuleRunnerBridgeApi {
  context: {
    command?: string;
    devServer?: {
      origin: string;
    };
  };
}

function parseBridgeApi(value: unknown): ModuleRunnerBridgeApi | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("context" in value)) return null;

  const { context } = value;
  if (typeof context !== "object" || context === null) return null;

  const command =
    "command" in context && typeof context.command === "string"
      ? context.command
      : undefined;

  let devServer: ModuleRunnerBridgeApi["context"]["devServer"];
  if ("devServer" in context) {
    const candidate = context.devServer;
    if (typeof candidate === "object" && candidate !== null) {
      if ("origin" in candidate && typeof candidate.origin === "string") {
        devServer = { origin: candidate.origin };
      }
    }
  }

  return { context: { command, devServer } };
}
