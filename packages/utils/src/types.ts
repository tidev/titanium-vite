export type ProjectType = "alloy" | "classic";

export type Platform = "android" | "ios";

export interface TiViteContext {
  platform: string;
  deployType: string;
  target?: string;
  /**
   * IDs of native (and CommonJS) modules declared in `tiapp.xml`, already
   * filtered to those that apply to the active build platform. The Vite
   * pipeline externalizes these so Titanium's runtime loader resolves them.
   */
  nativeModules: string[];
}

export interface TiBridgeApi {
  context: TiViteContext;
  reportTiApiUsage: (tiSymbols: Record<string, string[]>) => void;
}

export const TI_BRIDGE_PLUGIN_NAME = "ti-vite-bridge";
