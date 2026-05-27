import { expect, test } from "vitest";

import {
  createAlloyAliases,
  createAlloyOptimizeDepsInclude,
  createAlloyOptimizeDepsExclude,
  createAlloyOptimizeDepsRolldownOptions,
  createAlloyResolveAliases,
  createAlloyServerFsAllow,
  patchForViteCompatibility,
} from "./core.js";

test("creates Vite and optimizer aliases from one Alloy alias source", () => {
  const aliases = createAlloyAliases({
    appDir: "/project/app",
    alloyMain: "/project/node_modules/alloy/Alloy/template/lib/alloy.js",
    alloyRoot: "/project/node_modules/alloy/Alloy",
    alloyUtilsRoot: "/workspace/alloy-utils/lib",
    backboneVersion: "1.0.0",
  });

  expect(aliases.resolve).toContainEqual({
    find: /^\/?alloy\/(sync|underscore|widget|controllers\/BaseController)/,
    replacement: "/project/node_modules/alloy/Alloy/lib/alloy/$1",
  });
  expect(aliases.optimizeDeps).toEqual({
    "/alloy": "/project/node_modules/alloy/Alloy/template/lib/alloy.js",
    "/alloy/backbone":
      "/project/node_modules/alloy/Alloy/lib/alloy/backbone/1.0.0/backbone.js",
    "/alloy/constants": "/workspace/alloy-utils/lib/constants.js",
    "/alloy/underscore":
      "/project/node_modules/alloy/Alloy/lib/alloy/underscore.js",
  });
});

test("preserves existing Vite resolve aliases when adding Alloy aliases", () => {
  expect(
    createAlloyResolveAliases(
      [{ find: /^existing$/, replacement: "/project/existing.js" }],
      [{ find: /^\/?alloy$/, replacement: "/project/alloy.js" }],
    ),
  ).toEqual([
    { find: /^existing$/, replacement: "/project/existing.js" },
    { find: /^\/?alloy$/, replacement: "/project/alloy.js" },
  ]);
});

test("allows serving the consuming Alloy app files in dev", () => {
  expect(
    createAlloyServerFsAllow({
      existing: ["/vite/client"],
      alloyRoot: "/project/node_modules/alloy/Alloy",
      alloyUtilsRoot: "/workspace/alloy-utils/lib",
      appDir: "/project/app",
    }),
  ).toEqual([
    "/vite/client",
    "/project/app",
    "/project/node_modules/alloy/Alloy",
    "/workspace/alloy-utils/lib",
  ]);
});

test("excludes Alloy runtime entry from dependency optimization", () => {
  expect(createAlloyOptimizeDepsExclude(["existing"])).toEqual([
    "existing",
    "alloy.bootstrap",
  ]);
});

test("pre-optimizes Alloy runtime entry for dev boot", () => {
  expect(createAlloyOptimizeDepsInclude(["existing"])).toEqual([
    "existing",
    "alloy/Alloy/lib/alloy/controllers/BaseController.js",
    "alloy/Alloy/lib/alloy/underscore.js",
    "alloy/Alloy/lib/alloy/widget.js",
    "alloy/Alloy/template/lib/alloy.js",
    "alloy/Alloy/lib/alloy/backbone/0.9.2/backbone.js",
    "alloy/Alloy/lib/alloy/sync/localStorage.js",
    "alloy/Alloy/lib/alloy/sync/properties.js",
    "alloy/Alloy/lib/alloy/sync/sql.js",
  ]);
});

test("pre-optimizes configured Alloy runtime dependencies for dev boot", () => {
  expect(
    createAlloyOptimizeDepsInclude(["existing"], {
      backboneVersion: "1.4.0",
      syncAdapters: ["properties"],
    }),
  ).toEqual([
    "existing",
    "alloy/Alloy/lib/alloy/controllers/BaseController.js",
    "alloy/Alloy/lib/alloy/underscore.js",
    "alloy/Alloy/lib/alloy/widget.js",
    "alloy/Alloy/template/lib/alloy.js",
    "alloy/Alloy/lib/alloy/backbone/1.4.0/backbone.js",
    "alloy/Alloy/lib/alloy/sync/properties.js",
  ]);
});

test("uses target-neutral optimization for Titanium CJS runtime dependencies", () => {
  const options = createAlloyOptimizeDepsRolldownOptions({
    aliases: { "/alloy/underscore": "/project/alloy/underscore.js" },
    existing: {
      platform: "node",
      resolve: {
        alias: { existing: "/project/existing.js" },
      },
    },
    plugin: { name: "alloy-test" },
    platform: "neutral",
  });

  expect(options.platform).toBe("neutral");
  expect(options.resolve?.alias).toEqual({
    existing: "/project/existing.js",
    "/alloy/underscore": "/project/alloy/underscore.js",
  });
});

test("unwraps Vite ESM namespaces for Alloy sync adapter requires", () => {
  const code = patchForViteCompatibility(`
exports.M = function() {
\tmod = require('/alloy/sync/' + adapter.type);
};
exports.C = function() {
\tmod = require('/alloy/sync/' + config.adapter.type);
};
`);

  expect(code).toContain(
    "mod = require('/alloy/sync/' + adapter.type);\n\t\tmod = mod && mod.default ? mod.default : mod;",
  );
  expect(code).toContain(
    "mod = require('/alloy/sync/' + config.adapter.type);\n\t\tmod = mod && mod.default ? mod.default : mod;",
  );
  expect(
    code.match(/mod = mod && mod\.default \? mod\.default : mod;/g),
  ).toHaveLength(2);
});
