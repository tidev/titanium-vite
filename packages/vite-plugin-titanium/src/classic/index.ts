import type { Platform } from "@titanium-sdk/vite-utils";
import { assetsPlugin } from "./assets.js";
import { bootstrapPlugin } from "./bootstrap.js";
import { virtualEntryPlugin } from "./entry.js";

export interface ClassicPluginOptions {
  platform: Platform;
}

export function classicPlugin(options: ClassicPluginOptions) {
  const { platform } = options;

  return [virtualEntryPlugin(), bootstrapPlugin(platform), assetsPlugin({ platform })];
}
