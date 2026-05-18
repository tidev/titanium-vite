"use strict";

module.exports = function migrateCjsExports(fileInfo) {
  return migrateCjsExportsSource(fileInfo.source, fileInfo.path);
};

module.exports.parser = "babel";

function migrateCjsExportsSource(source, filePath = "<source>") {
  const exportSpecs = [];
  const firstPass = migrateConstWrappedExports(source, exportSpecs);
  const secondPass = migrateDirectExports(firstPass, exportSpecs, filePath);
  return appendExportSpecs(secondPass, exportSpecs);
}

function migrateConstWrappedExports(source, exportSpecs) {
  return source.replace(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*exports\.([A-Za-z_$][\w$]*)\s*=\s*((?:async\s*)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\})\s*\);/g,
    (_match, localName, exportName, value) => {
      const declaration = `const ${localName} = ${value}`;
      exportSpecs.push(
        localName === exportName ? localName : `${localName} as ${exportName}`,
      );

      return `${declaration};`;
    },
  );
}

function migrateDirectExports(source, exportSpecs, filePath) {
  return source
    .replace(
      /^(\s*)exports\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;([^\n]*(?=\n|$))/gm,
      (_match, indent, exportName, localName, trailing) => {
        if (exportName === localName) {
          return `${indent}export { ${localName} };${trailing}`;
        }
        return `${indent}export { ${localName} as ${exportName} };${trailing}`;
      },
    )
    .replace(
      /^(\s*)exports\.([A-Za-z_$][\w$]*)\s*=\s*async\s*\(/gm,
      (_match, indent, exportName, offset) => {
        assertNoLocalBinding(source, exportName, filePath, offset);
        return `${indent}export const ${exportName} = async (`;
      },
    )
    .replace(
      /^(\s*)exports\.([A-Za-z_$][\w$]*)\s*=\s*\(/gm,
      (_match, indent, exportName, offset) => {
        assertNoLocalBinding(source, exportName, filePath, offset);
        return `${indent}export const ${exportName} = (`;
      },
    )
    .replace(
      /^(\s*)exports\.([A-Za-z_$][\w$]*)\s*=\s*function\b/gm,
      (_match, indent, exportName, offset) => {
        assertNoLocalBinding(source, exportName, filePath, offset);
        return `${indent}export const ${exportName} = function`;
      },
    )
    .replace(
      /^(\s*)exports\.([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);(\s*(?=\n|$))/gm,
      (_match, indent, exportName, value, trailing, offset) => {
        assertNoLocalBinding(source, exportName, filePath, offset);
        return `${indent}export const ${exportName} = ${value};${trailing}`;
      },
    );
}

function assertNoLocalBinding(source, exportName, filePath, offset) {
  if (!hasLocalBinding(source, exportName)) return;

  const line = source.slice(0, offset).split("\n").length;
  throw new Error(
    `Cannot migrate exports.${exportName} in ${filePath}:${line}: ` +
      `a local binding named "${exportName}" already exists. ` +
      "Rename the existing binding or rewrite this export manually.",
  );
}

function hasLocalBinding(source, name) {
  const escapedName = escapeRegExp(name);
  return (
    new RegExp(
      `(^|\\n)\\s*(?:const|let|var|function|class)\\s+${escapedName}\\b`,
    ).test(source) || hasImportBinding(source, name)
  );
}

function hasImportBinding(source, name) {
  for (const statement of source.matchAll(
    /^import\s+([^;]+?)\s+from\s+['"][^'"]+['"];?/gm,
  )) {
    const importClause = statement[1];
    if (!importClause) continue;

    const defaultImport = importClause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (defaultImport?.[1] === name) return true;

    const namespaceImport = importClause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespaceImport?.[1] === name) return true;

    const namedImports = importClause.match(/\{([\s\S]*)\}/);
    if (!namedImports?.[1]) continue;

    for (const specifier of namedImports[1].split(",")) {
      const parts = specifier.trim().split(/\s+as\s+/);
      const localName = parts[1] ?? parts[0];
      if (localName?.trim() === name) return true;
    }
  }

  return false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appendExportSpecs(source, exportSpecs) {
  if (exportSpecs.length === 0) return source;

  const uniqueSpecs = [...new Set(exportSpecs)];
  const exportBlock = `export {\n${uniqueSpecs
    .map((spec) => `\t${spec},`)
    .join("\n")}\n};\n`;

  return `${source.replace(/\s*$/, "\n\n")}${exportBlock}`;
}

module.exports.migrateCjsExportsSource = migrateCjsExportsSource;
