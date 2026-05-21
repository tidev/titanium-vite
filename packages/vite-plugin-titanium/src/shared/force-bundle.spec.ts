import { expect, test } from "vitest";

import { isEnvironmentBuiltin } from "./force-bundle.js";

test("matches string builtins configured on the environment", () => {
  expect(isEnvironmentBuiltin("os", ["os"])).toBe(true);
});

test("matches regexp builtins configured on the environment", () => {
  expect(isEnvironmentBuiltin("node:events", [/^node:/])).toBe(true);
});

test("does not match unrelated bare imports", () => {
  expect(isEnvironmentBuiltin("is-odd", ["os", /^node:/])).toBe(false);
});
