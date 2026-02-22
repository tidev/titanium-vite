export type ProjectType = "alloy" | "classic";

export type Platform = "android" | "ios";

export interface TiViteContext {
  platform: string;
  deployType: string;
  target?: string;
}

export interface TiBridgeApi {
  context?: TiViteContext;
  reportTiApiUsage: (tiSymbols: Record<string, string[]>) => void;
}

export const TI_BRIDGE_PLUGIN_NAME = "ti-vite-bridge";
