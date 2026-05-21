import { expect, test } from "vitest";

import {
  createTitaniumDevEnvironmentOptions,
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
