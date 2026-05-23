import type { IncomingMessage, NextFunction } from "connect";
import type { ServerResponse } from "node:http";
import type { DevEnvironment, HotPayload, Plugin } from "vite";

import { createTitaniumEnvironment } from "@titanium-sdk/vite-titanium-environment";

const DEFAULT_FULL_RELOAD_DEBOUNCE_MS = 100;

interface TitaniumReloadEnvironment {
  hot: Pick<DevEnvironment["hot"], "send">;
}

interface TitaniumFullReloadScheduler {
  schedule: (
    environment: TitaniumReloadEnvironment,
    triggeredBy: string,
  ) => void;
  cancel: () => void;
}

export function createTitaniumFullReloadScheduler(
  debounceMs = DEFAULT_FULL_RELOAD_DEBOUNCE_MS,
): TitaniumFullReloadScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingEnvironment: TitaniumReloadEnvironment | undefined;
  let pendingTriggeredBy: string | undefined;

  return {
    schedule(environment, triggeredBy) {
      pendingEnvironment = environment;
      pendingTriggeredBy = triggeredBy;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        if (pendingEnvironment && pendingTriggeredBy) {
          pendingEnvironment.hot.send({
            type: "full-reload",
            path: "*",
            triggeredBy: pendingTriggeredBy,
          });
        }
        timer = undefined;
        pendingEnvironment = undefined;
        pendingTriggeredBy = undefined;
      }, debounceMs);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = undefined;
      pendingEnvironment = undefined;
      pendingTriggeredBy = undefined;
    },
  };
}

/**
 * Core plugin for Titanium specific configuration.
 *
 * - Configures the builder to only build the titanium environment
 * - Adds the titanium environment to the environments
 * - Adds a middleware to handle the invoke request
 */
export function corePlugin(): Plugin {
  const fullReloadScheduler = createTitaniumFullReloadScheduler();

  return {
    name: "titanium:core",
    config() {
      return {
        appType: "custom",
        build: {
          target: "ios13",
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
          client: {
            optimizeDeps: {
              disabled: "dev",
            },
          },
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
          return next();
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
        const payload = parseHotPayload(JSON.parse(rawBody));
        if (!payload) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: { message: "Invalid invoke payload" } }),
          );
          return;
        }
        const result =
          await server.environments.titanium?.hot.handleInvoke(payload);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      }

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      server.middlewares.use(titaniumInvokeMiddleware);
    },
    hotUpdate({ file, modules, timestamp }) {
      if (this.environment.name !== "titanium") {
        return;
      }
      if (modules.length === 0) {
        return;
      }

      const invalidatedModules = new Set<(typeof modules)[number]>();
      for (const mod of modules) {
        this.environment.moduleGraph.invalidateModule(
          mod,
          invalidatedModules,
          timestamp,
          true,
        );
      }
      fullReloadScheduler.schedule(this.environment, file);
      return [];
    },
    closeBundle() {
      fullReloadScheduler.cancel();
    },
  };
}

function parseHotPayload(value: unknown): HotPayload | null {
  if (!isRecord(value)) return null;

  if (value.type === "custom") {
    if (typeof value.event !== "string") return null;
    return {
      type: "custom",
      event: value.event,
      data: value.data,
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
