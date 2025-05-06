import type { ServerResponse } from "node:http";
import type { IncomingMessage, NextFunction } from "connect";
import type { HotPayload, Plugin } from "vite";
import { createTitaniumEnvironment } from "vite-titanium-environment";

/**
 * Core plugin for Titanium specific configuration.
 *
 * - Configures the builder to only build the titanium environment
 * - Adds the titanium environment to the environments
 * - Adds a middleware to handle the invoke request
 */
export function corePlugin(): Plugin {
  return {
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
          titanium: createTitaniumEnvironment(),
        },
        server: {
          watch: {
            ignored: ["build/**"],
          },
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
}
