import type { Platform } from "../types.js";
import { assetsPlugin } from "./assets.js";

export interface ClassicPluginOptions {
  platform: Platform;
}

export function classicPlugin(options: ClassicPluginOptions) {
  const { platform } = options;

  return [assetsPlugin({ platform })];
}
