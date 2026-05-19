import fs from "node:fs";
import path from "node:path";
import type { Platform } from "@titanium-sdk/vite-utils";
import type { Plugin } from "vite";

import type { AlloyContext } from "./context.js";

export function assetsPlugin(ctx: AlloyContext, platform: Platform): Plugin {
  const platformFolder = platform === "ios" ? "iphone" : "android";

  return {
    name: "titanium:alloy:assets",
    apply: "build",

    generateBundle() {
      const files = new Map<string, string>();
      collectAssets(path.join(ctx.appDir, "assets"), files, {
        stripPlatformFolder: false,
      });
      collectAssets(path.join(ctx.appDir, "assets", platformFolder), files, {
        stripPlatformFolder: true,
      });

      for (const [fileName, filePath] of files) {
        this.emitFile({
          type: "asset",
          fileName,
          source: fs.readFileSync(filePath),
        });
      }
    },
  };
}

interface CollectAssetOptions {
  stripPlatformFolder: boolean;
}

function collectAssets(
  dir: string,
  files: Map<string, string>,
  options: CollectAssetOptions,
  relBase = "",
) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!options.stripPlatformFolder && isPlatformDir(entry.name)) continue;
      collectAssets(
        path.join(dir, entry.name),
        files,
        options,
        path.join(relBase, entry.name),
      );
      continue;
    }

    const fileName = path.join(relBase, entry.name).replace(/\\/g, "/");
    files.set(fileName, path.join(dir, entry.name));
  }
}

function isPlatformDir(name: string) {
  return name === "android" || name === "iphone" || name === "ios";
}
