import { viteStaticCopy } from "vite-plugin-static-copy";

import type { Platform } from "@titanium/vite-utils";

export interface AssetsPluginOptions {
  platform: Platform;
}

export function assetsPlugin(options: AssetsPluginOptions) {
  const { platform } = options;

  const platformFolder = platform === "ios" ? "iphone" : "android";

  return viteStaticCopy({
    targets: [
      {
        src: "src/semantic.colors.json",
        dest: ".",
      },
      {
        src: "src/assets",
        dest: ".",
      },
      {
        src: `src/${platformFolder}`,
        dest: ".",
      },
    ],
  });
}
