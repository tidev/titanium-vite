import { expect, test } from "vitest";

import {
  createTitaniumDevEnvironmentOptions,
  normalizeNodeModuleFileRequest,
  resolveEnvironmentBuiltinId,
} from "./dev.js";

test("preserves Titanium builtins when Vite provides context options", () => {
  const options = createTitaniumDevEnvironmentOptions({
    resolve: {
      builtins: ["custom-runtime"],
    },
  });

  expect(options.resolve?.builtins).toEqual(
    expect.arrayContaining(["os", "events", "custom-runtime"]),
  );
});

test("keeps dependency discovery enabled for module runner imports", () => {
  const options = createTitaniumDevEnvironmentOptions({
    optimizeDeps: {
      noDiscovery: true,
    },
  });

  expect(options.optimizeDeps?.noDiscovery).toBe(false);
});

test("resolves Vite-wrapped builtin ids for module runner fetches", () => {
  expect(resolveEnvironmentBuiltinId("/@id/os", ["os"])).toBe("os");
});

test("ignores Vite-wrapped ids that are not environment builtins", () => {
  expect(resolveEnvironmentBuiltinId("/@id/is-odd", ["os"])).toBeNull();
});

test("normalizes Vite root-relative node_modules URLs to app filesystem paths", () => {
  expect(
    normalizeNodeModuleFileRequest(
      "/node_modules/is-odd/index.js?v=123",
      "/Users/example/app",
    ),
  ).toBe("/Users/example/app/node_modules/is-odd/index.js");
});

test("preserves Vite fs-prefixed node_modules filesystem paths", () => {
  expect(
    normalizeNodeModuleFileRequest(
      "/@fs/Users/example/app/node_modules/is-odd/index.js?v=123",
      "/Users/example/app",
    ),
  ).toBe("/Users/example/app/node_modules/is-odd/index.js");
});
