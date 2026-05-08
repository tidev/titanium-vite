import path from "node:path";
import type { Platform } from "@titanium/vite-utils";
import type { Plugin } from "vite";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { bareImportRE } from "@titanium/vite-utils";

import { componentPlugin } from "./component.js";
import { configPlugin } from "./config.js";
import { AlloyContext, initContextPlugin } from "./context.js";
import { corePlugin } from "./core.js";
import { entryPlugin } from "./entry.js";
import { modelPlugin } from "./model.js";
import { widgetPlugin } from "./widget.js";

export function resolveAlloyPlugins(
  projectDir: string,
  platform: Platform,
): Plugin[] {
  const appDir = path.join(projectDir, "app");

  const context = new AlloyContext(projectDir, platform);
  return [
    initContextPlugin(context),
    corePlugin(context, platform),
    configPlugin(context),
    entryPlugin(appDir),
    /**
     * Alloy supports installing Node modules under `app/lib`, which cannot be
     * resolved by the default node resolve algorithim that Vite uses when the
     * import comes from `app/controllers`. Perform an additional Node style
     * resolve jailed to `app/lib` to handle those edge cases.
     */
    nodeResolve({
      rootDir: path.join(context.appDir, "lib"),
      jail: path.join(context.appDir, "lib"),
      preferBuiltins: true,
      dedupe(importee) {
        // Enable dedupe for all bare imports to force resolve from `rootDir`
        return bareImportRE.test(importee);
      },
    }),
    componentPlugin(context),
    modelPlugin(context),
    widgetPlugin(appDir),
  ];
}
