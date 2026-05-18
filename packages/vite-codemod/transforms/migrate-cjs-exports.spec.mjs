import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const transform = require("./migrate-cjs-exports.cjs");

function run(source) {
  return transform({ path: "fixture.js", source });
}

describe("migrate-cjs-exports", () => {
  test("converts direct function reference exports to ESM export lists", () => {
    expect(run("function open() {}\nexports.open = open;\n")).toBe(
      "function open() {}\nexport { open };\n",
    );
  });

  test("preserves trailing comments when converting function reference exports", () => {
    expect(
      run(
        "function changePanelState() {}\nexports.changePanelState = changePanelState; // Used externally.\n",
      ),
    ).toBe(
      "function changePanelState() {}\nexport { changePanelState }; // Used externally.\n",
    );
  });

  test("converts aliased function reference exports", () => {
    expect(run("function show() {}\nexports.open = show;\n")).toBe(
      "function show() {}\nexport { show as open };\n",
    );
  });

  test("converts inline arrow function exports to exported const declarations", () => {
    expect(run("exports.open = () => {\n\tshow();\n};\n")).toBe(
      "const open = () => {\n\tshow();\n};\n\nexport {\n\topen,\n};\n",
    );
  });

  test("converts simple expression exports to exported const declarations", () => {
    expect(run("exports.waypointId = waypoint._id;\n")).toBe(
      "const waypointId = waypoint._id;\n\nexport {\n\twaypointId,\n};\n",
    );
  });

  test("fails when an inline export would collide with an existing local binding", () => {
    expect(() =>
      run("function open() {}\nexports.open = () => close();\n"),
    ).toThrow(
      'Cannot migrate exports.open in fixture.js:2: a local binding named "open" already exists.',
    );
  });

  test("fails when an inline export would collide with an imported binding", () => {
    expect(() =>
      run(
        "import { showOptions } from 'app-utils';\nexports.showOptions = async () => showOptions();\n",
      ),
    ).toThrow(
      'Cannot migrate exports.showOptions in fixture.js:2: a local binding named "showOptions" already exists.',
    );
  });

  test("converts const-wrapped exports and keeps the local binding", () => {
    expect(run("const hide = (exports.hide = () => {\n\tclose();\n});\n")).toBe(
      "const hide = () => {\n\tclose();\n};\n\nexport {\n\thide,\n};\n",
    );
  });

  test("converts differently named const-wrapped exports", () => {
    expect(
      run("const draw = (exports.redraw = () => {\n\tpaint();\n});\n"),
    ).toBe(
      "const draw = () => {\n\tpaint();\n};\n\nexport {\n\tdraw as redraw,\n};\n",
    );
  });

  test("normalizes export const declarations for Alloy compiler compatibility", () => {
    expect(run("export const open = () => {};\n")).toBe(
      "const open = () => {};\n\nexport {\n\topen,\n};\n",
    );
  });

  test("preserves local references to normalized export const declarations", () => {
    expect(
      run(
        "export const BookingType = { CAR: 'car' };\nexport const Types = [BookingType.CAR];\n",
      ),
    ).toBe(
      "const BookingType = { CAR: 'car' };\nconst Types = [BookingType.CAR];\n\nexport {\n\tBookingType,\n\tTypes,\n};\n",
    );
  });
});
