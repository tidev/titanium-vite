import { createRequire } from "node:module";
import type { HmrOptions, Plugin } from "vite";

import { TI_BRIDGE_PLUGIN_NAME } from "@titanium-sdk/vite-utils";

const require = createRequire(import.meta.url);

const VIRTUAL_ENTRY_ID = "virtual:titanium/module-runner";

interface DevModuleRunnerCodeOptions {
  devServerOrigin: string;
  devServerHmrPath: string;
  webSocketToken: string;
}

export function createDevModuleRunnerCode({
  devServerOrigin,
  devServerHmrPath,
  webSocketToken,
}: DevModuleRunnerCodeOptions): string {
  return `import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";
import WebSocket from "tiws";

const devServerOrigin = ${JSON.stringify(devServerOrigin)};
const devServerHmrPath = ${JSON.stringify(devServerHmrPath)};
const webSocketToken = ${JSON.stringify(webSocketToken)};
let isRestarting = false;

class TitaniumModulesEvaluator extends ESModulesEvaluator {
  runExternalModule(filepath) {
    const mod = require(normalizeExternalModuleId(filepath));
    return (mod && mod.__esModule) ? mod : { "default": mod };
  }
}

function normalizeExternalModuleId(id) {
  return id.startsWith("node:") ? id.slice(5) : id;
}

function createHmrUrl(origin, hmrPath, token) {
  const wsOrigin = origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const separator = hmrPath.includes("?") ? "&" : "?";
  return wsOrigin + hmrPath + separator + "token=" + encodeURIComponent(token);
}

function restartTitaniumApp() {
  if (isRestarting) {
    return;
  }
  isRestarting = true;
  console.log("[titanium] Vite full reload received, restarting app");
  Ti.App._restart();
}

function handleHmrPayload(payload) {
  if (!payload || typeof payload.type !== "string") {
    return;
  }

  if (payload.type === "full-reload" || payload.type === "update") {
    restartTitaniumApp();
  } else if (payload.type === "connected") {
    console.log("[titanium] Vite HMR transport connected");
  } else if (payload.type === "error") {
    console.log("[vite]", payload.err && payload.err.message ? payload.err.message : payload);
  }
}

function connectToViteHmr() {
  const socket = new WebSocket(createHmrUrl(devServerOrigin, devServerHmrPath, webSocketToken), "vite-hmr");
  socket.on("message", ({ data }) => {
    try {
      handleHmrPayload(JSON.parse(data));
    } catch (e) {
      console.log("[vite] failed to handle HMR payload", e);
    }
  });
  socket.on("error", (e) => {
    console.log("[vite] HMR websocket error", e);
  });
}

connectToViteHmr();

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
`;
}

export function moduleRunnerPlugin(): Plugin {
  let isProduction = false;
  let devServerOrigin: string | undefined;
  let devServerHmrPath = "/";
  let webSocketToken = "";

  return {
    name: "titanium:module-runner",
    enforce: "pre",

    configResolved(config) {
      isProduction = config.isProduction;
      devServerHmrPath = resolveDevServerHmrPath(
        config.base,
        config.server.hmr,
      );
      webSocketToken = config.webSocketToken;
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
      if (source === "tiws") {
        return require.resolve("tiws");
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
      // and stream modules on demand. The HMR websocket is only used as a
      // full-reload signal; targeted runner HMR remains disabled.
      return {
        code: createDevModuleRunnerCode({
          devServerOrigin,
          devServerHmrPath,
          webSocketToken,
        }),
      };
    },
  };
}

function resolveDevServerHmrPath(
  base: string,
  hmr: boolean | HmrOptions | undefined,
): string {
  if (typeof hmr === "object" && typeof hmr.path === "string") {
    return joinUrlPath(base, hmr.path);
  }

  return base.startsWith("/") ? base : `/${base}`;
}

function joinUrlPath(base: string, hmrPath: string): string {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = hmrPath.startsWith("/") ? hmrPath : `/${hmrPath}`;
  const joined = `${normalizedBase}${normalizedPath}`;
  return joined.startsWith("/") ? joined : `/${joined}`;
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
