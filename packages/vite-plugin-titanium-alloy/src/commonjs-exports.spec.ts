import { expect, test } from "vitest";

import { findLegacyCommonJsExport } from "./commonjs-exports.js";

test("detects legacy exports assignments", () => {
  expect(
    findLegacyCommonJsExport("exports.open = function () {}"),
  ).toMatchObject({
    kind: "exports",
    line: 1,
    column: 1,
  });
  expect(findLegacyCommonJsExport("exports['definition'] = {};")).toMatchObject(
    {
      kind: "exports",
      line: 1,
      column: 1,
    },
  );
});

test("detects module exports assignments", () => {
  expect(
    findLegacyCommonJsExport("module.exports = Controller;"),
  ).toMatchObject({
    kind: "module.exports",
    line: 1,
    column: 1,
  });
});

test("ignores exports text inside strings and comments", () => {
  const code = `
const message = "exports.open";
// module.exports = ignored;
/* exports.definition = ignored; */
export function open() {}
`;

  expect(findLegacyCommonJsExport(code)).toBeUndefined();
});
