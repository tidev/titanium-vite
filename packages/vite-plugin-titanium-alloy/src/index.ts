import fs from "node:fs";
import path from "node:path";
import type { Platform } from "@titanium-sdk/vite-utils";
import type { Plugin } from "vite";

import { assetsPlugin } from "./assets.js";
import { readBridgeCommand } from "./bridge-command.js";
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
    bootstrapEntriesPlugin(context, platform),
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
const BOOTSTRAP_VIRTUAL_PREFIX = "\0virtual:titanium/alloy-bootstrap-entry:";
const ALLOY_DEV_RUNTIME_PRELOADS = [
  "/alloy",
  "/alloy/CFG",
  "/alloy/backbone",
  "/alloy/controllers/BaseController",
  "/alloy/underscore",
];

function runtimeEntriesPlugin(ctx: AlloyContext, platform: Platform): Plugin {
  // Map virtual entry id → absolute source file path. Populated by
  // `collectRuntimeEntries` and consumed by `resolveId`/`load`.
  const entries = collectRuntimeEntries(ctx, platform);

  return {
    name: "titanium:alloy:runtime-entries",
    apply: "build",
    api: {
      titaniumDevModulePreloads: createDevModulePreloads(entries),
    },
    enforce: "pre",

    config(config) {
      if (readBridgeCommand(config.plugins) === "serve") {
        return;
      }

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

function bootstrapEntriesPlugin(ctx: AlloyContext, platform: Platform): Plugin {
  let entries = collectBootstrapEntries(ctx.appDir, platform);

  return {
    name: "titanium:alloy:bootstrap-entries",
    apply: "build",
    enforce: "pre",

    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      entries = collectBootstrapEntries(path.join(root, "app"), platform);
      return {
        build: {
          rolldownOptions: {
            input: entries.byChunk,
          },
        },
      };
    },

    resolveId(id) {
      const filePath = entries.byVirtualId[id];
      if (filePath) return filePath;
    },
  };
}

function createDevModulePreloads(entries: CollectedEntries): string[] {
  const chunkNames = Object.keys(entries.byChunk);
  const syncChunks = chunkNames.filter(isAlloySyncChunk);

  return [
    ...ALLOY_DEV_RUNTIME_PRELOADS,
    ...syncChunks.map((chunkName) => `/${chunkName}`),
  ];
}

function isAlloySyncChunk(chunkName: string): boolean {
  return chunkName.startsWith("alloy/sync/");
}

interface CollectedEntries {
  byChunk: Record<string, string>; // chunkName → virtualId
  byVirtualId: Record<string, string>; // virtualId → absolute file path
}

export function collectRuntimeEntries(
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
      collectDir(
        `alloy/widgets/${widget.name}/controllers`,
        `widgets/${widget.name}/controllers`,
        path.join(widgetsDir, widget.name, "controllers"),
      );
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

  return { byChunk, byVirtualId };
}

export function collectBootstrapEntries(
  appDir: string,
  platform: Platform,
) {
  const files = new Map<string, string>();

  const collectDir = (dir: string, relBase = "") => {
    if (!fs.existsSync(dir)) return;
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isLegacyPlatformDirectory(entry.name)) continue;
        collectDir(path.join(dir, entry.name), path.join(relBase, entry.name));
        continue;
      }

      const parsed = parseBootstrapFileName(entry.name);
      if (!parsed) continue;
      if (parsed.platform !== "base" && parsed.platform !== platform) continue;

      const name = path.join(relBase, parsed.name).replace(/\\/g, "/");
      files.set(name, path.join(dir, entry.name));
    }
  };

  collectDir(path.join(appDir, "lib"));

  const byChunk: Record<string, string> = {};
  const byVirtualId: Record<string, string> = {};
  for (const [name, filePath] of files) {
    const virtualId = `${BOOTSTRAP_VIRTUAL_PREFIX}${name}`;
    byChunk[name] = virtualId;
    byVirtualId[virtualId] = filePath;
  }

  return { byChunk, byVirtualId };
}

function parseBootstrapFileName(
  fileName: string,
): { name: string; platform: Platform | "base" } | undefined {
  const match = /^(?<base>.+\.bootstrap)(?:\.(?<platform>ios|android))?\.(?:js|ts)$/.exec(
    fileName,
  );
  const groups = match?.groups;
  if (!groups) return undefined;

  const name = groups.base;
  if (!name) return undefined;

  const platform = parseBootstrapPlatform(groups.platform);
  if (!platform) return undefined;

  return { name, platform };
}

function parseBootstrapPlatform(
  value: string | undefined,
): Platform | "base" | undefined {
  if (value === undefined) return "base";
  if (value === "ios" || value === "android") return value;
  return undefined;
}

function isLegacyPlatformDirectory(name: string) {
  return name === "android" || name === "ios" || name === "iphone";
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
