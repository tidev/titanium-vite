import { expect, test } from "vitest";

import { resolveNodeBuiltin } from "./node-builtins.js";

test("rewrites app builtin imports for the dev ModuleRunner builtin channel", () => {
  expect(resolveNodeBuiltin("events", "/project/src/app.js", false)).toEqual({
    external: true,
    id: "/titanium:builtin:events",
    moduleSideEffects: false,
  });
});

test("keeps tiws builtin imports as bare Titanium runtime builtins", () => {
  expect(
    resolveNodeBuiltin(
      "events",
      "/project/node_modules/tiws/src/websocket.js",
      false,
    ),
  ).toEqual({
    external: true,
    id: "events",
    moduleSideEffects: false,
  });
});

test("ignores non-builtin imports", () => {
  expect(resolveNodeBuiltin("tiws", "/project/src/app.js", false)).toBeNull();
});
