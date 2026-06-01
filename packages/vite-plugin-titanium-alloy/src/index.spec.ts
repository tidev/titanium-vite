import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { afterEach, expect, test } from "vitest";

import { AlloyContext } from "./context.js";
import {
  collectBootstrapEntries,
  collectRuntimeEntries,
  resolveAlloyPlugins,
} from "./index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const createdPaths: string[] = [];

afterEach(() => {
  for (const createdPath of createdPaths.splice(0)) {
    fs.rmSync(createdPath, { force: true, recursive: true });
  }
});

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

test("emits widget controller runtime entries for production requires", () => {
  const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
  const entries = collectRuntimeEntries(new AlloyContext(appRoot, "ios"), "ios");
  const inputs = Object.keys(entries.byChunk);

  expect(inputs).toEqual(
    expect.arrayContaining([
      "alloy/widgets/com.titanium.esmWidget/controllers/child",
      "alloy/widgets/com.titanium.esmWidget/controllers/widget",
    ]),
  );
});

test("collects Alloy bootstrap entries from app lib with platform suffix overrides", () => {
  const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
  const baseDir = path.join(appRoot, "app/lib/__bootstrap_entry_test__");
  const vendorDir = path.join(appRoot, "app/vendor/__bootstrap_entry_test__");
  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(vendorDir, { recursive: true });
  createdPaths.push(baseDir, vendorDir);
  fs.writeFileSync(path.join(baseDir, "plain.bootstrap.ts"), "");
  fs.writeFileSync(path.join(baseDir, "secure.bootstrap.ts"), "");
  fs.writeFileSync(path.join(baseDir, "secure.bootstrap.ios.ts"), "");
  fs.writeFileSync(path.join(baseDir, "secure.bootstrap.android.ts"), "");
  fs.writeFileSync(path.join(vendorDir, "legacy.bootstrap.ts"), "");

  const entries = collectBootstrapEntries(
    new AlloyContext(appRoot, "ios").appDir,
    "ios",
  );
  const inputs = Object.keys(entries.byChunk);

  expect(inputs).toEqual(
    expect.arrayContaining([
      "__bootstrap_entry_test__/plain.bootstrap",
      "__bootstrap_entry_test__/secure.bootstrap",
    ]),
  );
  expect(inputs).not.toContain("__bootstrap_entry_test__/secure.bootstrap.ios");
  expect(inputs).not.toContain("__bootstrap_entry_test__/secure.bootstrap.android");
  expect(inputs).not.toContain("__bootstrap_entry_test__/legacy.bootstrap");
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
