import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const jscodeshift = require("jscodeshift");
const transform = require("./migrate-cjs-requires.cjs");

function run(source, options = {}) {
  return transform(
    { path: "app/controllers/index.js", source },
    { jscodeshift },
    options,
  );
}

describe("migrate-cjs-requires", () => {
  test("converts top-level static require declarations to namespace imports", () => {
    expect(run("const XP = require('xp.ui');\nXP.createView();\n")).toBe(
      'import * as XP from "xp.ui";\nXP.createView();\n',
    );
  });

  test("converts static JSON require declarations to default imports", () => {
    expect(
      run("const countries = require('json/countries/en.json');\ncountries.DE;\n"),
    ).toBe(
      'import countries from "json/countries/en.json";\ncountries.DE;\n',
    );
  });

  test("converts default member requires to default imports", () => {
    expect(run("const Api = require('/api').default;\nApi.fetch();\n")).toBe(
      'import Api from "/api";\nApi.fetch();\n',
    );
  });

  test("converts named member requires to named imports", () => {
    expect(
      run("const createButton = require('xp.ui').createActionButton;\n"),
    ).toBe('import { createActionButton as createButton } from "xp.ui";\n');
  });

  test("converts object destructuring requires to named imports", () => {
    expect(
      run(
        "const { createView, createActionButton: createButton } = require('xp.ui');\n",
      ),
    ).toBe(
      'import { createView, createActionButton as createButton } from "xp.ui";\n',
    );
  });

  test("leaves destructured JSON requires unchanged", () => {
    expect(run("const { DE } = require('json/countries/en.json');\n")).toBe(
      "const { DE } = require('json/countries/en.json');\n",
    );
  });

  test("leaves non-top-level requires unchanged by default", () => {
    expect(run("function load() {\n\treturn require('ti.calendar');\n}\n")).toBe(
      "function load() {\n\treturn require('ti.calendar');\n}\n",
    );
  });

  test("fails on unsupported CommonJS syntax when requested", () => {
    expect(() =>
      run("function load() {\n\treturn require('ti.calendar');\n}\n", {
        failOnUnsupported: "true",
      }),
    ).toThrow(
      "Unsupported CommonJS require() in app/controllers/index.js:2.",
    );
  });

  test("fails on module.exports when requested", () => {
    expect(() =>
      run("module.exports = createApi;\n", { failOnUnsupported: "true" }),
    ).toThrow(
      "Unsupported CommonJS module.exports in app/controllers/index.js:1.",
    );
  });

  test("accepts jscodeshift dashed fail-on-unsupported option", () => {
    expect(() =>
      run("require('ti.calendar');\n", { "fail-on-unsupported": "true" }),
    ).toThrow(
      "Unsupported CommonJS require() in app/controllers/index.js:1.",
    );
  });
});
