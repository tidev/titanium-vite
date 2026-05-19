export type ProjectType = "alloy" | "classic";

export type Platform = "android" | "ios";

export interface TiNativeModule {
  [key: string]: unknown;
  id: string;
  version?: string;
  platform?: string;
}

export interface TiViteContext {
  command?: "build" | "serve";
  platform: string;
  deployType?: string;
  target?: string;
  devServer?: {
    origin: string;
  };
  /**
   * Native (and CommonJS) modules declared in `tiapp.xml`. This includes all
   * declared modules, not only those matching the active build platform, so
   * guarded cross-platform imports can still be externalized during bundling.
   */
  nativeModules?: TiNativeModule[];
}

export interface TiBridgeApi {
  context: TiViteContext;
  reportTiApiUsage: (tiSymbols: Record<string, string[]>) => void;
}

export const TI_BRIDGE_PLUGIN_NAME = "ti-vite-bridge";
