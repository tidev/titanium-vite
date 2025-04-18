import { expect, test } from "vitest";

import { parseRequires } from "./index.js";

export function expectToBeDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

test("Simple require", () => {
  const source = `
    const test = require("test");
    console.log(test);
  `;

  const [require] = parseRequires(source);
  expectToBeDefined(require);
  const { statementStart, statementEnd, specifier } = require;
  expect(require.safe).toBe(true);
  expect(specifier).toBe("test");
  expect(source.slice(statementStart, statementEnd)).toBe('require("test")');
});

test("Require with trailing comma", () => {
  const source = `require(\n"foo",\n)`;
  const [require] = parseRequires(source);
  expectToBeDefined(require);
  expect(source.slice(require.statementStart, require.statementEnd)).toBe(
    'require(\n"foo",\n)',
  );
  expect(source.slice(require.start, require.end)).toBe('"foo"');
});

test(`Require with comments`, () => {
  const source = "require(/* comment */ `asdf` /* comment */)";
  const [require] = parseRequires(source);
  expectToBeDefined(require);
  expect(source.slice(require.statementStart, require.statementEnd)).toBe(
    "require(/* comment */ `asdf` /* comment */)",
  );
  expect(source.slice(require.start, require.end)).toBe("`asdf`");
});

test(`Dynamic require with comments`, () => {
  const source = 'require("foo" + /* comment */ "bar")';
  const [require] = parseRequires(source);
  expectToBeDefined(require);
  expect(source.slice(require.statementStart, require.statementEnd)).toBe(
    'require("foo" + /* comment */ "bar")',
  );
  expect(source.slice(require.start, require.end)).toBe(
    '"foo" + /* comment */ "bar"',
  );
});

test("Dynamic require with trailing comma", () => {
  const source = `require(\n"foo" + bar,\n)`;
  const [require] = parseRequires(source);
  expectToBeDefined(require);
  expect(source.slice(require.statementStart, require.statementEnd)).toBe(
    'require(\n"foo" + bar,\n)',
  );
  expect(source.slice(require.start, require.end)).toBe('"foo" + bar,');
});
