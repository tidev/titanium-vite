import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const jscodeshift = require("jscodeshift");
const transform = require("./migrate-widget-wpath-requires.cjs");

function run(source, path = "app/widgets/io.lambus.emptyState/controllers/widget.js") {
  return transform({ path, source }, { jscodeshift });
}

describe("migrate-widget-wpath-requires", () => {
  test("converts literal widget WPATH requires to namespace ESM imports", () => {
    expect(
      run(
        "const ActionButton = require(WPATH('button'));\nActionButton.createActionButton();\n",
      ),
    ).toBe(
      'import * as ActionButton from "/alloy/widgets/io.lambus.emptyState/lib/button";\nActionButton.createActionButton();\n',
    );
  });

  test("converts nested literal widget WPATH requires", () => {
    expect(
      run(
        'const format = require(WPATH("formatters/date"));\nformat.shortDate();\n',
      ),
    ).toBe(
      'import * as format from "/alloy/widgets/io.lambus.emptyState/lib/formatters/date";\nformat.shortDate();\n',
    );
  });

  test("leaves non-widget files unchanged", () => {
    expect(
      run(
        "const ActionButton = require(WPATH('button'));\n",
        "app/controllers/index.js",
      ),
    ).toBe("const ActionButton = require(WPATH('button'));\n");
  });
});
