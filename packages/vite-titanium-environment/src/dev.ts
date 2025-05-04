import type { DevEnvironmentContext, ResolvedConfig } from "vite";
import { DevEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

export function createTitaniumDevEnvironment(
  name: string,
  config: ResolvedConfig,
  context: DevEnvironmentContext,
) {
  /*
  const connection = {
    on(event: string, listener: () => void) {
      console.log("transport.on", event, listener);
    },
    send(data: HotPayload) {
      console.log("transport.send", data);
    },
  };

  const transport: HotChannel = {
    on: (event, listener) => {
      console.log("transport.on", event);
    },
    send: (data) => {
      console.log("transport.send", data);
    },
  };
  */

  const titaniumDevEnvironment = new DevEnvironment(name, config, {
    ...context,
    options: {
      resolve: { builtins: [...nodeCompatBuiltins] },
      ...context.options,
    },
  });
  return titaniumDevEnvironment;
}
