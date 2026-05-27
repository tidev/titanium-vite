import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { expect, test } from "vitest";

import { resolveAlloyPlugins } from "./index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("preloads only shared Alloy runtime modules in dev", () => {
  const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
  const preloads = collectTitaniumDevModulePreloads(
    resolveAlloyPlugins(appRoot, "ios"),
  );

  expect(preloads).toEqual(
    expect.arrayContaining([
      "/alloy",
      "/alloy/CFG",
      "/alloy/backbone",
      "/alloy/controllers/BaseController",
      "/alloy/underscore",
      "/alloy/sync/properties",
    ]),
  );
  expect(preloads.indexOf("/alloy/sync/properties")).toBeGreaterThan(
    preloads.indexOf("/alloy/underscore"),
  );
  expect(preloads).not.toContain("/alloy/controllers/index");
  expect(preloads).not.toContain("/alloy/models/Book");
});

function collectTitaniumDevModulePreloads(plugins: readonly Plugin[]): string[] {
  const preloads: string[] = [];

  for (const plugin of plugins) {
    const api: unknown = plugin.api;
    if (!isRecord(api)) continue;

    const value = api.titaniumDevModulePreloads;
    if (!Array.isArray(value)) continue;

    for (const preload of value) {
      if (typeof preload === "string") {
        preloads.push(preload);
      }
    }
  }

  return preloads;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
