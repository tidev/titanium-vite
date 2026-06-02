import path from "node:path";
import { expect, test } from "vitest";

import { createContextualWidgetSourceId } from "./widget.js";

test("resolves contextual widget imports from the importing widget", () => {
  const appDir = "/project/app";
  const result = createContextualWidgetSourceId(
    appDir,
    "#widget/lib/button",
    path.join(appDir, "widgets/io.lambus.emptyState/controllers/widget.js"),
  );

  expect(result).toBe(
    path.join(appDir, "widgets", "io.lambus.emptyState", "lib/button"),
  );
});

test("ignores contextual widget imports outside widget source", () => {
  const appDir = "/project/app";
  const result = createContextualWidgetSourceId(
    appDir,
    "#widget/lib/button",
    path.join(appDir, "controllers/index.js"),
  );

  expect(result).toBeUndefined();
});
