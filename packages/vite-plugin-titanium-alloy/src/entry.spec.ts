import { expect, test } from "vitest";

import { createAlloyEntryCode } from "./entry.js";

test("normalizes lazy index controller imports across ESM and CJS output", async () => {
  const code = createAlloyEntryCode("initialize();");

  expect(code).toContain(
    "const __alloyIndexControllerModule = await __alloyLoadIndexController();",
  );
  expect(code).toContain(
    "const IndexController = __alloyIndexControllerModule.default ?? __alloyIndexControllerModule;",
  );
  expect(code).not.toContain(
    "const { default: IndexController } = await __alloyLoadIndexController();",
  );
});
