import type { Plugin } from "vite";

const VIRTUAL_ENTRY_ID = 'virtual:titanium/module-runner'

export function moduleRunnerPlugin(): Plugin {
  let isProduction = false

  return {
    name: "titanium:module-runner",

    configResolved(config) {
      isProduction = config.isProduction
    },

    resolveId(source) {
      return source === VIRTUAL_ENTRY_ID ? `\0${source}` : null;
    },

    load(id) {
      if (id === `\0${VIRTUAL_ENTRY_ID}`) {
        const entryModuleId = isProduction ? './main.js' : 'virtual:titanium/main';

        return {
          code: `import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

class TitaniumModulesEvaluator extends ESModulesEvaluator {
  runExternalModule(filepath) {
    const mod = require(filepath);
    console.log(mod.__esModule);
    return (mod && mod.__esModule) ? mod : { "default": mod };
  }
}

console.log(global.import)

const moduleRunner = new ModuleRunner(
  {
    transport: {
      invoke: async (data) => {
        console.log("Invoke", data);

        /*
        const response = await new Promise((resolve, reject) => {
          const client = Ti.Network.createHTTPClient({
            onload: function (e) {
              console.log("Received text: " + this.responseText);
              resolve(JSON.parse(this.responseText));
            },
            onerror: function (e) {
              console.log("Error", e);
              reject(e);
            },
            timeout: 10000
          });
          client.open("POST", "http://localhost:5173/invoke");
          console.log("Sending HTTP request");
          client.send(JSON.stringify(data));
        });
        console.log(response);

        return response;
        */

        try {
          const assets = kroll.binding('assets');
          const id = data.data.data[0];
          console.log('Module id', id);

          if (id.startsWith('/titanium:builtin:')) {
            const builtinId = id.slice(18);
            console.log('Builtin id', builtinId);
            return {
              result: {
                externalize: builtinId,
                type: 'builtin',
              }
            }
          }

          const code = assets.readAsset(id);
          const result = {
            code,
            file: id,
            id,
            invalidate: false
          };
          console.log(result);

          return { result };
        } catch (e) {
          console.log("Error", e);
          return null;
        }
      },
    },
    hmr: false,
  },
  new TitaniumModulesEvaluator(),
);

(async () => {
  try {
    await moduleRunner.import('${entryModuleId}')
  } catch (e) {
    console.log('Module runner import failed', e);
  }
})()`
        }
      }
    },
  }
}