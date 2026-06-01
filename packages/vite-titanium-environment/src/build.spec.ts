import { expect, test } from "vitest";

import { createTitaniumBuildInput } from "./build.js";

test("creates app build input with module runner and main entries", () => {
  expect(createTitaniumBuildInput("app")).toEqual({
    "module-runner": "virtual:titanium/module-runner",
    main: "virtual:titanium/main",
  });
});

test("keeps bootstrap entries for serve bootstrap builds", () => {
  expect(
    createTitaniumBuildInput("serve-bootstrap", {
      "lib/start.bootstrap": "\0virtual:titanium/bootstrap-entry:lib/start.bootstrap",
      main: "virtual:titanium/main",
      "module-runner": "virtual:titanium/module-runner",
    }),
  ).toEqual({
    "lib/start.bootstrap": "\0virtual:titanium/bootstrap-entry:lib/start.bootstrap",
    "module-runner": "virtual:titanium/module-runner",
  });
});

test("ignores non-object input while creating serve bootstrap build input", () => {
  expect(createTitaniumBuildInput("serve-bootstrap", "src/app.js")).toEqual({
    "module-runner": "virtual:titanium/module-runner",
  });
});
