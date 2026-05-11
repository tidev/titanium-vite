import { createRequire } from "node:module";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

const VIRTUAL_ENTRY_ID = 'virtual:titanium/module-runner'

export function moduleRunnerPlugin(): Plugin {
  let isProduction = false

  return {
    name: "titanium:module-runner",
    enforce: "pre",

    configResolved(config) {
      isProduction = config.isProduction
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

      // Development: stand up Vite's ModuleRunner so the dev server can transform
      // and stream modules on demand. Loaded into Titanium via the script-mode
      // bootstrap; static `import` would SyntaxError, so this code goes through
      // Rolldown's CJS output (which converts the bare `import` below into a
      // `require()` against the vite/module-runner file inlined by the bundler).
      return {
        code: `import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

class TitaniumModulesEvaluator extends ESModulesEvaluator {
  runExternalModule(filepath) {
    const mod = require(filepath);
    return (mod && mod.__esModule) ? mod : { "default": mod };
  }
}

const moduleRunner = new ModuleRunner(
  {
    transport: {
      invoke: async (payload) => {
        try {
          const { name, data } = payload.data;
          if (name === 'getBuiltins') {
            return { result: [] };
          }
          if (name === 'fetchModule') {
            const [url] = data;
            if (url.startsWith('/titanium:builtin:')) {
              return { result: { externalize: url.slice(18), type: 'builtin' } };
            }
            const assets = kroll.binding('assets');
            const code = assets.readAsset(url);
            return { result: { code, file: url, id: url, invalidate: false } };
          }
          return { error: { message: 'unsupported invoke: ' + name } };
        } catch (e) {
          return { error: { message: String(e && e.message || e) } };
        }
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