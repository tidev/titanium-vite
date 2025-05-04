import type { IncomingMessage, NextFunction } from "connect";
import type { ServerResponse } from "node:http";
import type { HotPayload, Plugin } from "vite";
import { createTitaniumEnvironment } from "vite-titanium-environment";

import type { Platform, ProjectType } from "./types.js";
import { classicPlugin } from "./classic/index.js";
import { nodeBuiltinsPlugin } from "./node-builtins.js";
import { resolvePlugin } from "./resolve.js";

export interface TitaniumOptions {
  projectType: ProjectType;
}

export function titanium(options: TitaniumOptions) {
  const { projectType } = options;

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const platform = process.env.TITANIUM_BUILD_PLATFORM;
  validatePlatform(platform);

  const titaniumCorePlugin: Plugin = {
    name: "titanium:core",
    config() {
      return {
        appType: "custom",
        build: {
          outDir: "Resources",
        },
        builder: {
          buildApp: async (builder) => {
            // Vite comes with client and ssr environemnts by default which we don't need,
            // so we only build the titanium environment
            const environment = builder.environments.titanium;
            if (!environment) {
              throw new Error("Titanium environment not found");
            }
            await builder.build(environment);
          },
        },
        environments: {
          titanium: createTitaniumEnvironment({}),
        },
      };
    },
    configureServer(server) {
      async function titaniumInvokeMiddleware(
        req: IncomingMessage,
        res: ServerResponse,
        next: NextFunction,
      ) {
        if (req.url !== "/invoke") {
          next();
        }

        function getBody(request: IncomingMessage) {
          return new Promise<string>((resolve) => {
            const bodyParts: Buffer[] = [];
            let body;
            request
              .on("data", (chunk: Buffer) => {
                bodyParts.push(chunk);
              })
              .on("end", () => {
                body = Buffer.concat(bodyParts).toString();
                resolve(body);
              });
          });
        }

        const rawBody = await getBody(req);
        const payload = JSON.parse(rawBody) as HotPayload;
        const result =
          await server.environments.titanium?.hot.handleInvoke(payload);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      }

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      server.middlewares.use(titaniumInvokeMiddleware);
    },
  };

  const virtualEntries = ["virtual:titanium/app", "virtual:titanium/polyfills"];
  const titaniumVirtualEntryPlugin: Plugin = {
    name: "titanium:virtual-entries",

    resolveId(source) {
      return virtualEntries.includes(source) ? `\0${source}` : null;
    },

    load(id) {
      if (id === `\0virtual:titanium/app`) {
        return {
          code: `import '/src/app.js';`,
        };
      } else if (id === `\0virtual:titanium/polyfills`) {
        return {
          code: `import '@titanium/polyfills';`,
        };
      }
    },
  };

  const sharedPlugins = [
    titaniumCorePlugin,
    titaniumVirtualEntryPlugin,
    nodeBuiltinsPlugin(),
    resolvePlugin({ projectType, platform }),
  ];

  const projectPlugins =
    projectType === "classic" ? classicPlugin({ platform }) : [];

  return [...sharedPlugins, ...projectPlugins];
}

function validatePlatform(platform?: string): asserts platform is Platform {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Invalid platform: ${platform}`);
  }
}
