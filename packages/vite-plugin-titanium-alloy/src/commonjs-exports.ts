export interface LegacyCommonJsExport {
  kind: "exports" | "module.exports";
  line: number;
  column: number;
}

export function findLegacyCommonJsExport(
  code: string,
): LegacyCommonJsExport | undefined {
  let index = 0;

  while (index < code.length) {
    const char = code[index];
    const next = code[index + 1];

    if (char === '"' || char === "'" || char === "`") {
      index = findQuotedEnd(code, index, char);
      continue;
    }

    if (char === "/" && next === "/") {
      index = findLineCommentEnd(code, index);
      continue;
    }

    if (char === "/" && next === "*") {
      index = findBlockCommentEnd(code, index);
      continue;
    }

    if (code.startsWith("exports", index) && isExportsReference(code, index)) {
      return {
        kind: "exports",
        ...getLocation(code, index),
      };
    }

    if (
      code.startsWith("module", index) &&
      isModuleExportsReference(code, index)
    ) {
      return {
        kind: "module.exports",
        ...getLocation(code, index),
      };
    }

    index += 1;
  }
}

export function assertNoLegacyCommonJsExport(
  code: string,
  id: string,
  sourceKind: "controller" | "model",
) {
  const violation = findLegacyCommonJsExport(code);
  if (!violation) return;

  throw new Error(
    [
      `Legacy CommonJS export syntax is not supported in Alloy ${sourceKind}s.`,
      `Found ${violation.kind} in ${id}:${violation.line}:${violation.column}.`,
      "Use ESM exports instead, for example `export function open() {}` or `export const definition = {}`.",
    ].join(" "),
  );
}

function findQuotedEnd(code: string, start: number, quote: string) {
  let index = start + 1;
  while (index < code.length) {
    if (code[index] === "\\") {
      index += 2;
      continue;
    }
    if (code[index] === quote) {
      return index + 1;
    }
    index += 1;
  }
  return code.length;
}

function findLineCommentEnd(code: string, start: number) {
  const end = code.indexOf("\n", start + 2);
  return end === -1 ? code.length : end;
}

function findBlockCommentEnd(code: string, start: number) {
  const end = code.indexOf("*/", start + 2);
  return end === -1 ? code.length : end + 2;
}

function isExportsReference(code: string, start: number) {
  const before = code[start - 1];
  const afterName = start + "exports".length;
  const after = code[afterName];

  if (isIdentifierPart(before) || isIdentifierPart(after)) return false;

  let index = afterName;
  while (/\s/.test(code[index] ?? "")) {
    index += 1;
  }

  return code[index] === "." || code[index] === "[";
}

function isModuleExportsReference(code: string, start: number) {
  const before = code[start - 1];
  const afterName = start + "module".length;
  const after = code[afterName];

  if (isIdentifierPart(before) || isIdentifierPart(after)) return false;

  let index = afterName;
  while (/\s/.test(code[index] ?? "")) {
    index += 1;
  }

  if (code[index] !== ".") return false;
  index += 1;

  while (/\s/.test(code[index] ?? "")) {
    index += 1;
  }

  if (!code.startsWith("exports", index)) return false;

  const afterExports = code[index + "exports".length];
  return !isIdentifierPart(afterExports);
}

function isIdentifierPart(char: string | undefined) {
  return char != null && /[$\w]/.test(char);
}

function getLocation(code: string, index: number) {
  const lines = code.slice(0, index).split("\n");
  const currentLine = lines.at(-1) ?? "";
  return {
    line: lines.length,
    column: currentLine.length + 1,
  };
}
