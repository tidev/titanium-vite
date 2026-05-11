import fs from "node:fs";
import path from "node:path";
import type { Platform } from "@titanium/vite-utils";
import type { Plugin } from "vite";

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
    componentPlugin(context),
    modelPlugin(context),
    widgetPlugin(appDir),
    componentEntriesPlugin(appDir, platform),
  ];
}

/**
 * Alloy resolves controllers, widgets, and models at runtime via dynamic
 * `require('/alloy/controllers/' + name)` (and equivalents). Rolldown can't
 * follow those, so unless each component is emitted as its own output file at
 * its expected Titanium path, the runtime require will hit a missing module.
 *
 * Enumerate components on disk in production and add each as a Rolldown input
 * with an explicit chunk name (`alloy/controllers/<name>`). The build env's
 * `entryFileNames` callback uses the chunk name verbatim, so the file lands at
 * `Resources/alloy/controllers/<name>.js` and Titanium's CJS loader resolves
 * the dynamic require against it.
 */
const VIRTUAL_PREFIX = "\0virtual:titanium/alloy-entry:";

function componentEntriesPlugin(appDir: string, platform: Platform): Plugin {
  // Map virtual entry id → absolute source file path. Populated by
  // `collectControllers` and consumed by `resolveId`/`load`.
  const entries = collectControllers(appDir, platform);

  return {
    name: "titanium:alloy:component-entries",
    apply: "build",
    enforce: "pre",

    config() {
      const input: Record<string, string> = {};
      for (const [chunkName, virtualId] of Object.entries(entries.byChunk)) {
        input[chunkName] = virtualId;
      }
      return {
        build: {
          rolldownOptions: { input },
        },
      };
    },

    resolveId(id) {
      // Intercept our own virtual entry ids before the shared `titanium:resolve`
      // plugin sees them — that plugin treats any `/`-prefixed id as
      // project-root-relative and rebases it under `app/lib/`, which would
      // accumulate the prefix on every re-entry and never terminate.
      const filePath = entries.byVirtualId[id];
      if (filePath) return filePath;
    },
  };
}

interface CollectedEntries {
  byChunk: Record<string, string>; // chunkName → virtualId
  byVirtualId: Record<string, string>; // virtualId → absolute file path
}

function collectControllers(appDir: string, platform: Platform): CollectedEntries {
  const controllersDir = path.join(appDir, "controllers");
  const byChunk: Record<string, string> = {};
  const byVirtualId: Record<string, string> = {};

  const walk = (dir: string, relBase = "") => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // platform override dirs (e.g. `controllers/android/`) are merged into
        // their base name by Alloy's compiler; the compiler picks the right
        // variant. Skip platform subtrees so we emit one chunk per logical
        // controller.
        if (entry.name === platform) continue;
        if (entry.name === "android" || entry.name === "ios") continue;
        walk(path.join(dir, entry.name), path.join(relBase, entry.name));
        continue;
      }
      if (!/\.(js|ts)$/.test(entry.name)) continue;
      const name = path
        .join(relBase, entry.name.replace(/\.(js|ts)$/, ""))
        .replace(/\\/g, "/");
      const chunkName = `alloy/controllers/${name}`;
      const virtualId = `${VIRTUAL_PREFIX}controllers/${name}`;
      byChunk[chunkName] = virtualId;
      byVirtualId[virtualId] = path.join(dir, entry.name);
    }
  };

  walk(controllersDir);
  return { byChunk, byVirtualId };
}
