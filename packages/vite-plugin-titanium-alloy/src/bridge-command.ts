import type { UserConfig } from "vite";
import { TI_BRIDGE_PLUGIN_NAME } from "@titanium-sdk/vite-utils";

export type TiBridgeCommand = "build" | "serve";

export function readBridgeCommand(
  plugins: UserConfig["plugins"],
): TiBridgeCommand | undefined {
  if (!Array.isArray(plugins)) return undefined;

  for (const plugin of plugins) {
    const command = readBridgeCommandFromPlugin(plugin);
    if (command) return command;
  }
}

function readBridgeCommandFromPlugin(value: unknown): TiBridgeCommand | undefined {
  if (Array.isArray(value)) {
    return readBridgeCommand(value);
  }
  if (!isRecord(value)) return undefined;
  if (value.name !== TI_BRIDGE_PLUGIN_NAME) return undefined;

  const { api } = value;
  if (!isRecord(api)) return undefined;
  const { context } = api;
  if (!isRecord(context)) return undefined;
  const { command } = context;

  return command === "build" || command === "serve" ? command : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
