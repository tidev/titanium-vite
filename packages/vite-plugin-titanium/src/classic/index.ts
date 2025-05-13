import type { Platform } from "../types.js";
import { assetsPlugin } from "./assets.js";
import { virtualEntryPlugin } from "./entry.js";

export interface ClassicPluginOptions {
  platform: Platform;
}

export function classicPlugin(options: ClassicPluginOptions) {
  const { platform } = options;

  return [virtualEntryPlugin(), assetsPlugin({ platform })];
}
