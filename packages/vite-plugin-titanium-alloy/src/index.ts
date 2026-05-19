import fs from "node:fs";
import path from "node:path";
import type { Platform } from "@titanium-sdk/vite-utils";
import type { Plugin } from "vite";

import { assetsPlugin } from "./assets.js";
import { componentPlugin } from "./component.js";
import { configPlugin } from "./config.js";
import { AlloyContext, initContextPlugin } from "./context.js";
import { corePlugin } from "./core.js";
import { entryPlugin } from "./entry.js";
import { modelPlugin } from "./model.js";
import { widgetPlugin } from "./widget.js";

const DEFAULT_SYNC_ADAPTERS = ["localStorage", "properties", "sql"];

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
    assetsPlugin(context, platform),
    runtimeEntriesPlugin(context, platform),
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
 * `Resources/alloy/controllers/<name>.js` (or `Resources/alloy/models/<name>.js`)
 * and Titanium's CJS loader resolves the dynamic require against it.
 */
const VIRTUAL_PREFIX = "\0virtual:titanium/alloy-entry:";

function runtimeEntriesPlugin(ctx: AlloyContext, platform: Platform): Plugin {
  // Map virtual entry id → absolute source file path. Populated by
  // `collectRuntimeEntries` and consumed by `resolveId`/`load`.
  const entries = collectRuntimeEntries(ctx, platform);

  return {
    name: "titanium:alloy:runtime-entries",
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

function collectRuntimeEntries(
  ctx: AlloyContext,
  platform: Platform,
): CollectedEntries {
  const { appDir, root: alloyRoot } = ctx;
  const byChunk: Record<string, string> = {};
  const byVirtualId: Record<string, string> = {};

  const addEntry = (chunkName: string, virtualId: string, filePath: string) => {
    byChunk[chunkName] = virtualId;
    byVirtualId[virtualId] = filePath;
  };

  const collectDir = (
    chunkRoot: string,
    virtualRoot: string,
    dir: string,
    skipPlatformDirs = true,
  ) => {
    const walk = (currentDir: string, relBase = "") => {
      if (!fs.existsSync(currentDir)) return;
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          // platform override dirs (e.g. `controllers/android/`) are merged into
          // their base name by Alloy's compiler; the compiler picks the right
          // variant. Skip platform subtrees so we emit one chunk per logical
          // component.
          if (skipPlatformDirs) {
            if (entry.name === platform) continue;
            if (entry.name === "android" || entry.name === "ios") continue;
          }
          walk(path.join(currentDir, entry.name), path.join(relBase, entry.name));
          continue;
        }
        if (!/\.(js|ts)$/.test(entry.name)) continue;
        const name = path
          .join(relBase, entry.name.replace(/\.(js|ts)$/, ""))
          .replace(/\\/g, "/");
        const chunkName = `${chunkRoot}/${name}`;
        const virtualId = `${VIRTUAL_PREFIX}${virtualRoot}/${name}`;
        addEntry(chunkName, virtualId, path.join(currentDir, entry.name));
      }
    };

    walk(dir);
  };

  collectDir(
    "alloy/controllers",
    "controllers",
    path.join(appDir, "controllers"),
  );
  collectDir("alloy/models", "models", path.join(appDir, "models"));
  const widgetsDir = path.join(appDir, "widgets");
  if (fs.existsSync(widgetsDir)) {
    for (const widget of fs.readdirSync(widgetsDir, { withFileTypes: true })) {
      if (!widget.isDirectory()) continue;
      collectWidgetModels(appDir, widget.name, platform, byChunk, byVirtualId);
    }
  }

  for (const adapterType of getConfiguredSyncAdapters(ctx.compiler.config.adapters)) {
    const adapterFile = path.join(
      alloyRoot,
      "lib/alloy/sync",
      `${adapterType}.js`,
    );
    if (!fs.existsSync(adapterFile)) continue;
    addEntry(
      `alloy/sync/${adapterType}`,
      `${VIRTUAL_PREFIX}sync/${adapterType}`,
      adapterFile,
    );
  }

  collectBootstrapEntries(appDir, platform, byChunk, byVirtualId);

  return { byChunk, byVirtualId };
}

function collectBootstrapEntries(
  appDir: string,
  platform: Platform,
  byChunk: Record<string, string>,
  byVirtualId: Record<string, string>,
) {
  const platformFolder = platform === "ios" ? "iphone" : "android";
  const roots = ["lib", "vendor"];
  const files = new Map<string, string>();

  const collectDir = (dir: string, relBase = "") => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "ios") continue;
        if (entry.name === "iphone") continue;
        if (entry.name === "android") continue;
        collectDir(path.join(dir, entry.name), path.join(relBase, entry.name));
        continue;
      }
      if (!entry.name.endsWith(".bootstrap.js")) continue;
      const name = path
        .join(relBase, entry.name.replace(/\.js$/, ""))
        .replace(/\\/g, "/");
      files.set(name, path.join(dir, entry.name));
    }
  };

  const collectPlatformDir = (dir: string, relBase = "") => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        collectPlatformDir(
          path.join(dir, entry.name),
          path.join(relBase, entry.name),
        );
        continue;
      }
      if (!entry.name.endsWith(".bootstrap.js")) continue;
      const name = path
        .join(relBase, entry.name.replace(/\.js$/, ""))
        .replace(/\\/g, "/");
      files.set(name, path.join(dir, entry.name));
    }
  };

  for (const root of roots) {
    const rootDir = path.join(appDir, root);
    collectDir(rootDir);
    collectPlatformDir(path.join(rootDir, platformFolder));
    if (platform === "ios") {
      collectPlatformDir(path.join(rootDir, "ios"));
    }
  }

  for (const [name, filePath] of files) {
    const virtualId = `${VIRTUAL_PREFIX}${name}`;
    byChunk[name] = virtualId;
    byVirtualId[virtualId] = filePath;
  }
}

function collectWidgetModels(
  appDir: string,
  widgetId: string,
  platform: Platform,
  byChunk: Record<string, string>,
  byVirtualId: Record<string, string>,
) {
  const modelsDir = path.join(appDir, "widgets", widgetId, "models");
  const walk = (dir: string, relBase = "") => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === platform) continue;
        if (entry.name === "android" || entry.name === "ios") continue;
        walk(path.join(dir, entry.name), path.join(relBase, entry.name));
        continue;
      }
      if (!/\.(js|ts)$/.test(entry.name)) continue;
      const name = path
        .join(relBase, entry.name.replace(/\.(js|ts)$/, ""))
        .replace(/\\/g, "/");
      const chunkName = `alloy/widgets/${widgetId}/models/${name}`;
      const virtualId = `${VIRTUAL_PREFIX}widgets/${widgetId}/models/${name}`;
      byChunk[chunkName] = virtualId;
      byVirtualId[virtualId] = path.join(dir, entry.name);
    }
  };

  walk(modelsDir);
}

function getConfiguredSyncAdapters(adapters: string | string[] | undefined) {
  if (!adapters) return DEFAULT_SYNC_ADAPTERS;
  return Array.isArray(adapters) ? adapters : [adapters];
}
