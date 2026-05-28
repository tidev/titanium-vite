"use strict";

module.exports = function migrateCjsRequires(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  const imports = [];

  root.find(j.Program).forEach((programPath) => {
    const body = programPath.node.body;
    const remainingBody = [];

    for (const statement of body) {
      const importDeclaration = createImportFromRequireDeclaration(j, statement);
      if (importDeclaration) {
        importDeclaration.comments = statement.comments;
        imports.push(importDeclaration);
        continue;
      }

      remainingBody.push(statement);
    }

    if (imports.length === 0) return;

    const insertIndex = findImportInsertIndex(remainingBody);
    programPath.node.body = [
      ...remainingBody.slice(0, insertIndex),
      ...imports,
      ...remainingBody.slice(insertIndex),
    ];
  });

  if (isFailOnUnsupportedEnabled(options)) {
    failOnUnsupportedCommonJs(root, j, fileInfo.path);
  }

  return root.toSource({ quote: "double" });
};

module.exports.parser = "babel";

function createImportFromRequireDeclaration(j, statement) {
  if (statement.type !== "VariableDeclaration") return null;
  if (statement.declarations.length !== 1) return null;

  const declaration = statement.declarations[0];
  if (!declaration) return null;

  const requireSource = getStaticRequireSource(declaration.init);
  if (requireSource) {
    return createNamespaceImport(j, declaration.id, requireSource);
  }

  const memberRequire = getStaticRequireMember(declaration.init);
  if (memberRequire) {
    return createMemberImport(j, declaration.id, memberRequire);
  }

  return null;
}

function createNamespaceImport(j, binding, source) {
  if (binding.type === "Identifier") {
    if (isJsonSource(source)) {
      return j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier(binding.name))],
        j.literal(source),
      );
    }

    return j.importDeclaration(
      [j.importNamespaceSpecifier(j.identifier(binding.name))],
      j.literal(source),
    );
  }

  if (binding.type !== "ObjectPattern") return null;
  if (isJsonSource(source)) return null;

  const specifiers = [];
  for (const property of binding.properties) {
    if (property.type !== "Property") return null;
    const importedName = getPropertyName(property.key);
    if (!importedName) return null;
    if (property.value.type !== "Identifier") return null;

    specifiers.push(
      j.importSpecifier(
        j.identifier(importedName),
        property.value.name === importedName
          ? null
          : j.identifier(property.value.name),
      ),
    );
  }

  return j.importDeclaration(specifiers, j.literal(source));
}

function createMemberImport(j, binding, memberRequire) {
  if (binding.type !== "Identifier") return null;
  if (isJsonSource(memberRequire.source)) return null;

  if (memberRequire.member === "default") {
    return j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier(binding.name))],
      j.literal(memberRequire.source),
    );
  }

  return j.importDeclaration(
    [
      j.importSpecifier(
        j.identifier(memberRequire.member),
        binding.name === memberRequire.member
          ? null
          : j.identifier(binding.name),
      ),
    ],
    j.literal(memberRequire.source),
  );
}

function getStaticRequireSource(node) {
  if (!node || node.type !== "CallExpression") return null;
  if (node.callee.type !== "Identifier" || node.callee.name !== "require") {
    return null;
  }
  if (node.arguments.length !== 1) return null;

  return getStringLiteralValue(node.arguments[0]);
}

function getStaticRequireMember(node) {
  if (!node || node.type !== "MemberExpression") return null;
  if (node.computed) return null;

  const source = getStaticRequireSource(node.object);
  if (!source) return null;

  const member = getPropertyName(node.property);
  if (!member) return null;

  return { source, member };
}

function getPropertyName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function getStringLiteralValue(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function isJsonSource(source) {
  return source.endsWith(".json");
}

function findImportInsertIndex(body) {
  let index = 0;
  while (index < body.length && body[index]?.type === "ImportDeclaration") {
    index += 1;
  }
  return index;
}

function isFailOnUnsupportedEnabled(options) {
  return (
    options.failOnUnsupported === true ||
    options.failOnUnsupported === "true" ||
    options["fail-on-unsupported"] === true ||
    options["fail-on-unsupported"] === "true"
  );
}

function failOnUnsupportedCommonJs(root, j, filePath) {
  root.find(j.CallExpression, { callee: { type: "Identifier", name: "require" } })
    .forEach((path) => {
      throwUnsupported("require()", filePath, path.node.loc);
    });

  root.find(j.MemberExpression).forEach((path) => {
    const node = path.node;
    if (isModuleExports(node)) {
      throwUnsupported("module.exports", filePath, node.loc);
    }
    if (isExportsMember(node)) {
      throwUnsupported("exports", filePath, node.loc);
    }
  });
}

function isModuleExports(node) {
  return (
    node.object.type === "Identifier" &&
    node.object.name === "module" &&
    node.property.type === "Identifier" &&
    node.property.name === "exports"
  );
}

function isExportsMember(node) {
  return node.object.type === "Identifier" && node.object.name === "exports";
}

function throwUnsupported(kind, filePath, loc) {
  const line = loc?.start?.line ?? 1;
  throw new Error(`Unsupported CommonJS ${kind} in ${filePath}:${line}.`);
}
