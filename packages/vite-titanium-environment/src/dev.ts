import type { DevEnvironmentContext, ResolvedConfig } from "vite";
import { DevEnvironment } from "vite";

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
      connection.on("message", listener);
    },
    send: (data) => connection.send(data),
  };
  */

  const workerdDevEnvironment = new DevEnvironment(name, config, {
    options: {
      resolve: { conditions: ["custom"] },
      ...context.options,
    },
    hot: false,
  });
  return workerdDevEnvironment;
}
