import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { expect, test } from "vitest";

import { resolveAlloyPlugins } from "./index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("preloads Alloy sync adapters before model entries in dev", () => {
  const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
  const preloads = collectTitaniumDevModulePreloads(
    resolveAlloyPlugins(appRoot, "ios"),
  );

  expect(preloads.indexOf("/alloy/sync/properties")).toBeLessThan(
    preloads.indexOf("/alloy/models/Book"),
  );
  expect(preloads.indexOf("/alloy/sync/properties")).toBeLessThan(
    preloads.indexOf("/alloy/controllers/index"),
  );
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
