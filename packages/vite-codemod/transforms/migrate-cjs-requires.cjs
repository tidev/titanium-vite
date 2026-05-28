"use strict";

const fs = require("node:fs");
const path = require("node:path");

module.exports = function migrateCjsRequires(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  const registry = createImportRegistry(j, root, fileInfo.path);

  normalizeExistingImportDeclarations(root, j, fileInfo.path);
  migrateRequireDeclarations(root, j, registry, fileInfo.path);
  migrateRequireMembers(root, j, registry, fileInfo.path);
  migrateDirectRequires(root, j, registry, fileInfo.path);
  insertHoistedDeclarations(root, j, registry);

  if (isFailOnUnsupportedEnabled(options)) {
    failOnUnsupportedCommonJs(root, j, fileInfo.path);
  }

  return root.toSource({ quote: "double" });
};

module.exports.parser = "babel";

function migrateRequireDeclarations(root, j, registry, filePath) {
  root.find(j.VariableDeclaration).forEach((path) => {
    const statementComments = path.node.comments;
    const remainingDeclarations = [];

    for (const declaration of path.node.declarations) {
      const replacement = createDeclarationReplacement(
        j,
        declaration,
        registry,
        filePath,
        path,
        statementComments,
      );
      if (replacement === "remove") continue;

      remainingDeclarations.push(declaration);
    }

    if (remainingDeclarations.length === path.node.declarations.length) return;
    if (remainingDeclarations.length > 0) {
      path.node.declarations = remainingDeclarations;
      return;
    }

    j(path).remove();
  });
}

function createDeclarationReplacement(
  j,
  declaration,
  registry,
  filePath,
  declarationPath,
  comments,
) {
  const templateRequire = getJsonTemplateRequire(declaration.init);
  if (templateRequire && declaration.id.type === "Identifier") {
    declaration.init = createGlobLookupExpression(j, registry, templateRequire);
    return "keep";
  }

  const source = getStaticRequireSource(declaration.init);
  if (source) {
    if (
      declaration.id.type === "Identifier" &&
      shouldMigrateGuardedNativeRequireToDynamicImport(
        declarationPath,
        source,
        filePath,
      )
    ) {
      declaration.init = createAwaitedDynamicDefaultImport(j, source);
      return "keep";
    }
    if (isGuardedPotentialNativeRequire(declarationPath, source, filePath)) {
      return "keep";
    }
    return addImportForRequireBinding(
      j,
      registry,
      declaration.id,
      { kind: "whole", source },
      comments,
    )
      ? "remove"
      : "keep";
  }

  const memberRequire = getStaticRequireMember(declaration.init);
  if (memberRequire) {
    if (
      shouldMigrateGuardedNativeRequireToDynamicImport(
        declarationPath,
        memberRequire.source,
        filePath,
      )
    ) {
      declaration.init = j.memberExpression(
        createAwaitedDynamicDefaultImport(j, memberRequire.source),
        j.identifier(memberRequire.member),
      );
      return "keep";
    }
    if (isGuardedPotentialNativeRequire(declarationPath, memberRequire.source, filePath)) {
      return "keep";
    }
    if (
      declaration.id.type === "Identifier" &&
      memberRequire.member !== "default" &&
      registry.shouldUseRequireValueImport(memberRequire.source)
    ) {
      declaration.init = j.memberExpression(
        registry.ensureDefaultImport(memberRequire.source),
        j.identifier(memberRequire.member),
      );
      return "keep";
    }
    return addImportForRequireBinding(
      j,
      registry,
      declaration.id,
      { kind: "member", ...memberRequire },
      comments,
    )
      ? "remove"
      : "keep";
  }

  return "keep";
}

function addImportForRequireBinding(j, registry, binding, requireInfo, comments) {
  if (binding.type === "Identifier") {
    if (requireInfo.kind === "whole") {
      if (isJsonSource(requireInfo.source)) {
        registry.ensureDefaultImport(requireInfo.source, binding.name, comments);
        return true;
      }

      registry.ensureWholeModuleImport(requireInfo.source, binding.name, comments);
      return true;
    }

    if (isJsonSource(requireInfo.source)) return false;

    if (requireInfo.member === "default") {
      registry.ensureDefaultImport(requireInfo.source, binding.name, comments);
      return true;
    }

    registry.ensureNamedImport(
      requireInfo.source,
      requireInfo.member,
      binding.name,
      comments,
    );
    return true;
  }

  if (binding.type !== "ObjectPattern") return false;
  if (requireInfo.kind !== "whole") return false;
  if (isJsonSource(requireInfo.source)) return false;

  const specifiers = [];
  for (const property of binding.properties) {
    if (property.type !== "Property") return false;
    const importedName = getPropertyName(property.key);
    if (!importedName) return false;
    if (property.value.type !== "Identifier") return false;

    specifiers.push(
      j.importSpecifier(
        j.identifier(importedName),
        property.value.name === importedName
          ? null
          : j.identifier(property.value.name),
      ),
    );
  }

  registry.addImportDeclaration(
    j.importDeclaration(
      specifiers,
      j.literal(registry.normalizeSource(requireInfo.source)),
    ),
    comments,
  );
  return true;
}

function migrateRequireMembers(root, j, registry, filePath) {
  root.find(j.MemberExpression).forEach((path) => {
    const node = path.node;
    const source = getStaticRequireSource(node.object);
    if (!source) return;
    if (node.computed) return;
    if (shouldMigrateGuardedNativeRequireToDynamicImport(path, source, filePath)) {
      node.object = createAwaitedDynamicDefaultImport(j, source);
      return;
    }
    if (isGuardedPotentialNativeRequire(path, source, filePath)) return;

    const member = getPropertyName(node.property);
    if (!member) return;

    if (member === "default") {
      j(path).replaceWith(() => registry.ensureDefaultImport(source));
      return;
    }

    node.object = registry.shouldUseRequireValueImport(source)
      ? registry.ensureDefaultImport(source)
      : registry.ensureNamespaceImport(source);
  });
}

function migrateDirectRequires(root, j, registry, filePath) {
  root.find(j.CallExpression, { callee: { type: "Identifier", name: "require" } })
    .forEach((path) => {
      if (isRequireUsedAsMemberObject(path)) return;
      if (isRequireUsedAsVariableInit(path)) return;

      const templateRequire = getJsonTemplateRequire(path.node);
      if (templateRequire && isDirectRequireReplacementPosition(path)) {
        j(path).replaceWith(() =>
          createGlobLookupExpression(j, registry, templateRequire),
        );
        return;
      }

      const source = getStaticRequireSource(path.node);
      if (!source) return;
      if (!isDirectRequireReplacementPosition(path)) return;
      if (shouldMigrateGuardedNativeRequireToDynamicImport(path, source, filePath)) {
        j(path).replaceWith(() => createAwaitedDynamicDefaultImport(j, source));
        return;
      }
      if (isGuardedPotentialNativeRequire(path, source, filePath)) return;

      j(path).replaceWith(() => registry.ensureWholeModuleImport(source));
    });
}

function createImportRegistry(j, root, filePath) {
  const importDeclarations = [];
  const globDeclarations = [];
  const importKeys = new Map();
  const globKeys = new Map();
  const bindingCounts = collectBindingCounts(root, j, filePath);
  const reservedNames = new Set();

  return {
    addImportDeclaration(declaration, comments) {
      if (comments && !declaration.comments) {
        declaration.comments = comments;
      }
      importDeclarations.push(declaration);
    },

    normalizeSource(source) {
      return normalizeAppLocalSource(source, filePath);
    },

    ensureWholeModuleImport(source, preferredName, comments) {
      if (isJsonSource(source)) {
        return this.ensureDefaultImport(source, preferredName, comments);
      }

      if (this.shouldUseRequireValueImport(source)) {
        return this.ensureDefaultImport(source, preferredName, comments);
      }

      return this.ensureNamespaceImport(source, preferredName, comments);
    },

    shouldUseRequireValueImport(source) {
      return shouldUseRequireValueImport(source, this.normalizeSource(source));
    },

    ensureNamespaceImport(source, preferredName, comments) {
      const normalizedSource = this.normalizeSource(source);
      const key = preferredName
        ? `namespace:${normalizedSource}:${preferredName}`
        : `namespace:${normalizedSource}`;
      const existing = importKeys.get(key);
      if (existing) return j.identifier(existing);

      const localName = reserveImportName(
        preferredName ?? createImportBaseName(source),
        preferredName,
        bindingCounts,
        reservedNames,
      );
      const declaration = j.importDeclaration(
        [j.importNamespaceSpecifier(j.identifier(localName))],
        j.literal(normalizedSource),
      );
      this.addImportDeclaration(declaration, comments);
      importKeys.set(key, localName);
      return j.identifier(localName);
    },

    ensureDefaultImport(source, preferredName, comments) {
      const normalizedSource = this.normalizeSource(source);
      const key = preferredName
        ? `default:${normalizedSource}:${preferredName}`
        : `default:${normalizedSource}`;
      const existing = importKeys.get(key);
      if (existing) return j.identifier(existing);

      const localName = reserveImportName(
        preferredName ?? createImportBaseName(source),
        preferredName,
        bindingCounts,
        reservedNames,
      );
      const declaration = j.importDeclaration(
        [j.importDefaultSpecifier(j.identifier(localName))],
        j.literal(normalizedSource),
      );
      this.addImportDeclaration(declaration, comments);
      importKeys.set(key, localName);
      return j.identifier(localName);
    },

    ensureNamedImport(source, importedName, preferredName, comments) {
      const normalizedSource = this.normalizeSource(source);
      const key = `named:${normalizedSource}:${importedName}:${preferredName}`;
      const existing = importKeys.get(key);
      if (existing) return j.identifier(existing);

      const localName = reserveImportName(
        preferredName,
        preferredName,
        bindingCounts,
        reservedNames,
      );
      const declaration = j.importDeclaration(
        [
          j.importSpecifier(
            j.identifier(importedName),
            localName === importedName ? null : j.identifier(localName),
          ),
        ],
        j.literal(normalizedSource),
      );
      this.addImportDeclaration(declaration, comments);
      importKeys.set(key, localName);
      return j.identifier(localName);
    },

    ensureGlobMap(pattern) {
      const normalizedPattern = this.normalizeSource(pattern);
      const existing = globKeys.get(normalizedPattern);
      if (existing) return j.identifier(existing);

      const localName = reserveImportName(
        `${createImportBaseName(normalizedPattern, { keepJsonPrefix: true })}Modules`,
        undefined,
        bindingCounts,
        reservedNames,
      );
      globDeclarations.push(createGlobMapDeclaration(j, localName, normalizedPattern));
      globKeys.set(normalizedPattern, localName);
      return j.identifier(localName);
    },

    getHoistedDeclarations() {
      return [...importDeclarations, ...globDeclarations];
    },
  };
}

function collectBindingCounts(root, j, filePath) {
  const counts = new Map();
  const add = (name) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };

  root.find(j.ImportSpecifier).forEach((path) => {
    const local = path.node.local ?? path.node.imported;
    if (local?.type === "Identifier") add(local.name);
  });
  root.find(j.ImportDefaultSpecifier).forEach((path) => add(path.node.local.name));
  root.find(j.ImportNamespaceSpecifier).forEach((path) => add(path.node.local.name));
  root.find(j.VariableDeclaration).forEach((path) => {
    for (const declaration of path.node.declarations) {
      if (isRemovedRequireDeclaration(declaration, path, filePath)) continue;
      collectPatternNames(declaration.id, add);
    }
  });
  root.find(j.FunctionDeclaration).forEach((path) => {
    if (path.node.id) add(path.node.id.name);
    for (const param of path.node.params) collectPatternNames(param, add);
  });
  root.find(j.FunctionExpression).forEach((path) => {
    if (path.node.id) add(path.node.id.name);
    for (const param of path.node.params) collectPatternNames(param, add);
  });
  root.find(j.ArrowFunctionExpression).forEach((path) => {
    for (const param of path.node.params) collectPatternNames(param, add);
  });
  root.find(j.ClassDeclaration).forEach((path) => {
    if (path.node.id) add(path.node.id.name);
  });
  root.find(j.CatchClause).forEach((path) => {
    if (path.node.param) collectPatternNames(path.node.param, add);
  });

  return counts;
}

function isRemovedRequireDeclaration(declaration, declarationPath, filePath) {
  const source = getStaticRequireSource(declaration.init);
  if (source) {
    if (
      declaration.id.type === "Identifier" &&
      shouldMigrateGuardedNativeRequireToDynamicImport(
        declarationPath,
        source,
        filePath,
      )
    ) {
      return false;
    }
    if (isGuardedPotentialNativeRequire(declarationPath, source, filePath)) {
      return false;
    }
    return isRemovedRequireBinding(declaration.id, { kind: "whole", source });
  }

  const memberRequire = getStaticRequireMember(declaration.init);
  if (!memberRequire) return false;
  if (
    shouldMigrateGuardedNativeRequireToDynamicImport(
      declarationPath,
      memberRequire.source,
      filePath,
    )
  ) {
    return false;
  }
  if (isGuardedPotentialNativeRequire(declarationPath, memberRequire.source, filePath)) {
    return false;
  }
  if (
    declaration.id.type === "Identifier" &&
    memberRequire.member !== "default" &&
    shouldUseRequireValueImport(
      memberRequire.source,
      normalizeAppLocalSource(memberRequire.source, filePath),
    )
  ) {
    return false;
  }

  return isRemovedRequireBinding(declaration.id, {
    kind: "member",
    ...memberRequire,
  });
}

function isRemovedRequireBinding(binding, requireInfo) {
  if (binding.type === "Identifier") {
    if (requireInfo.kind === "whole") return true;
    return !isJsonSource(requireInfo.source);
  }

  return (
    binding.type === "ObjectPattern" &&
    requireInfo.kind === "whole" &&
    !isJsonSource(requireInfo.source)
  );
}

function collectPatternNames(pattern, add) {
  if (!pattern) return;
  if (pattern.type === "Identifier") {
    add(pattern.name);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) {
      if (property.type === "Property") {
        collectPatternNames(property.value, add);
      } else if (property.type === "RestElement") {
        collectPatternNames(property.argument, add);
      }
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) collectPatternNames(element, add);
    return;
  }
  if (pattern.type === "RestElement") {
    collectPatternNames(pattern.argument, add);
    return;
  }
  if (pattern.type === "AssignmentPattern") {
    collectPatternNames(pattern.left, add);
  }
}

function reserveImportName(baseName, preferredName, bindingCounts, reservedNames) {
  if (
    preferredName &&
    !reservedNames.has(preferredName) &&
    (bindingCounts.get(preferredName) ?? 0) === 0
  ) {
    reservedNames.add(preferredName);
    return preferredName;
  }

  if (!bindingCounts.has(baseName) && !reservedNames.has(baseName)) {
    reservedNames.add(baseName);
    return baseName;
  }

  const candidateBase = `${baseName}Module`;
  let candidate = candidateBase;
  let suffix = 2;
  while (reservedNames.has(candidate) || bindingCounts.has(candidate)) {
    candidate = `${candidateBase}${suffix}`;
    suffix += 1;
  }
  reservedNames.add(candidate);
  return candidate;
}

function insertHoistedDeclarations(root, j, registry) {
  const declarations = registry.getHoistedDeclarations();
  if (declarations.length === 0) return;

  root.find(j.Program).forEach((programPath) => {
    const body = programPath.node.body;
    const insertIndex = findImportInsertIndex(body);
    programPath.node.body = [
      ...body.slice(0, insertIndex),
      ...declarations,
      ...body.slice(insertIndex),
    ];
  });
}

function createGlobLookupExpression(j, registry, templateRequire) {
  const key = normalizeTemplateLiteralSource(j, registry, templateRequire.key);
  return j.memberExpression(
    registry.ensureGlobMap(templateRequire.pattern),
    key,
    true,
  );
}

function createGlobMapDeclaration(j, bindingName, pattern) {
  return j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier(bindingName),
      j.callExpression(
        j.memberExpression(
          {
            type: "MetaProperty",
            meta: j.identifier("import"),
            property: j.identifier("meta"),
          },
          j.identifier("glob"),
        ),
        [
          j.literal(pattern),
          j.objectExpression([
            j.property("init", j.identifier("eager"), j.literal(true)),
            j.property("init", j.identifier("import"), j.literal("default")),
          ]),
        ],
      ),
    ),
  ]);
}

function createAwaitedDynamicDefaultImport(j, source) {
  return j.memberExpression(
    j.awaitExpression(createDynamicImportExpression(j, source)),
    j.identifier("default"),
  );
}

function createDynamicImportExpression(j, source) {
  return {
    type: "CallExpression",
    callee: { type: "Import" },
    arguments: [j.literal(source)],
  };
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

function getJsonTemplateRequire(node) {
  if (!node || node.type !== "CallExpression") return null;
  if (node.callee.type !== "Identifier" || node.callee.name !== "require") {
    return null;
  }
  if (node.arguments.length !== 1) return null;

  const argument = node.arguments[0];
  if (!argument || argument.type !== "TemplateLiteral") return null;
  if (argument.expressions.length !== 1) return null;
  if (argument.quasis.length !== 2) return null;

  const prefix = argument.quasis[0]?.value.cooked;
  const suffix = argument.quasis[1]?.value.cooked;
  if (typeof prefix !== "string" || typeof suffix !== "string") return null;
  if (!suffix.endsWith(".json")) return null;

  return {
    key: argument,
    pattern: `${prefix}*${suffix}`,
  };
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

function shouldUseRequireValueImport(source, normalizedSource) {
  if (source !== normalizedSource) return false;
  if (normalizedSource.startsWith("~/")) return false;
  if (normalizedSource.startsWith(".") || normalizedSource.startsWith("/")) {
    return false;
  }
  if (normalizedSource === "alloy" || normalizedSource.startsWith("alloy/")) {
    return false;
  }

  return true;
}

function createImportBaseName(source, options = {}) {
  const normalizedSource =
    isJsonSource(source) && !options.keepJsonPrefix
      ? source.replace(/^~\/assets\/json\//, "").replace(/^json\//, "")
      : source;
  const parts = normalizedSource
    .replace(/\*/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  if (parts.length === 0) return "moduleImport";

  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower;
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}

function normalizeExistingImportDeclarations(root, j, filePath) {
  root.find(j.ImportDeclaration).forEach((importPath) => {
    const source = getStringLiteralValue(importPath.node.source);
    if (!source) return;

    importPath.node.source = j.literal(normalizeAppLocalSource(source, filePath));
  });
}

function normalizeTemplateLiteralSource(j, registry, templateLiteral) {
  if (templateLiteral.type !== "TemplateLiteral") return templateLiteral;
  if (templateLiteral.quasis.length !== 2) return templateLiteral;

  const prefix = templateLiteral.quasis[0]?.value.cooked;
  const suffix = templateLiteral.quasis[1]?.value.cooked;
  if (typeof prefix !== "string" || typeof suffix !== "string") {
    return templateLiteral;
  }

  const normalizedPattern = registry.normalizeSource(`${prefix}*${suffix}`);
  const starIndex = normalizedPattern.indexOf("*");
  if (starIndex === -1) return templateLiteral;

  const normalizedPrefix = normalizedPattern.slice(0, starIndex);
  const normalizedSuffix = normalizedPattern.slice(starIndex + 1);
  if (normalizedPrefix === prefix && normalizedSuffix === suffix) {
    return templateLiteral;
  }

  return j.templateLiteral(
    [
      j.templateElement(
        { cooked: normalizedPrefix, raw: normalizedPrefix },
        false,
      ),
      j.templateElement(
        { cooked: normalizedSuffix, raw: normalizedSuffix },
        true,
      ),
    ],
    templateLiteral.expressions,
  );
}

function normalizeAppLocalSource(source, filePath) {
  if (source.startsWith("~/")) return source;
  if (source.startsWith(".") || source.startsWith("virtual:")) return source;
  if (source.startsWith("#")) return source;
  if (source === "alloy" || source.startsWith("alloy/")) return source;

  const appRoot = findAppRoot(filePath);
  if (!appRoot) return source;

  if (source.startsWith("json/")) {
    const resolved = resolveAppSource(appRoot, "assets", source);
    return resolved ?? source;
  }

  if (source.startsWith("/json/")) {
    const resolved = resolveAppSource(appRoot, "assets", source.slice(1));
    return resolved ?? source;
  }

  if (source.startsWith("/")) {
    const resolved = resolveAppSource(appRoot, "lib", source.slice(1));
    return resolved ?? source;
  }

  if (isBareAppCandidate(source)) {
    return (
      resolveAppSource(appRoot, "lib", source) ??
      resolveAppSource(appRoot, "assets", source) ??
      source
    );
  }

  return source;
}

function findAppRoot(filePath) {
  const normalized = path.resolve(filePath);
  const parts = normalized.split(path.sep);
  const appIndex = parts.lastIndexOf("app");
  if (appIndex === -1) return null;

  return parts.slice(0, appIndex + 1).join(path.sep);
}

function isBareAppCandidate(source) {
  return !source.startsWith("@") && !source.includes(":");
}

function resolveAppSource(appRoot, aliasSegment, source) {
  const candidate = path.join(appRoot, aliasSegment, source);
  if (!sourceExists(candidate)) return null;

  return `~/${path.posix.join(aliasSegment, source.replace(/^\/+/, ""))}`;
}

function sourceExists(candidate) {
  if (candidate.includes("*")) {
    const wildcardIndex = candidate.indexOf("*");
    const prefix = candidate.slice(0, wildcardIndex);
    const directory = prefix.endsWith(path.sep) ? prefix : path.dirname(prefix);
    return fs.existsSync(directory);
  }

  if (fs.existsSync(candidate)) return true;

  const extensions = [".js", ".mjs", ".cjs", ".ts", ".json"];
  for (const extension of extensions) {
    if (fs.existsSync(`${candidate}${extension}`)) return true;
  }

  return extensions.some((extension) =>
    fs.existsSync(path.join(candidate, `index${extension}`)),
  );
}

function findImportInsertIndex(body) {
  let index = 0;
  while (index < body.length && body[index]?.type === "ImportDeclaration") {
    index += 1;
  }
  return index;
}

function isRequireUsedAsMemberObject(path) {
  const parent = path.parent?.node;
  return parent?.type === "MemberExpression" && parent.object === path.node;
}

function isRequireUsedAsVariableInit(path) {
  const parent = path.parent?.node;
  return parent?.type === "VariableDeclarator" && parent.init === path.node;
}

function isDirectRequireReplacementPosition(path) {
  const parent = path.parent?.node;
  if (!parent) return false;

  if (parent.type === "ReturnStatement" && parent.argument === path.node) {
    return true;
  }
  if (parent.type === "AssignmentExpression" && parent.right === path.node) {
    return true;
  }
  if (
    (parent.type === "CallExpression" || parent.type === "NewExpression") &&
    parent.arguments.includes(path.node)
  ) {
    return true;
  }
  if (parent.type === "ArrayExpression" && parent.elements.includes(path.node)) {
    return true;
  }
  if (parent.type === "Property" && parent.value === path.node) {
    return true;
  }

  return false;
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
  root.find(j.MemberExpression).forEach((path) => {
    const node = path.node;
    if (isComputedRequireMember(node)) {
      throwUnsupported("computed require member", filePath, node.loc);
    }
    if (isModuleExports(node)) {
      throwUnsupported("module.exports", filePath, node.loc);
    }
    if (isExportsMember(node)) {
      throwUnsupported("exports", filePath, node.loc);
    }
  });

  root.find(j.ConditionalExpression).forEach((path) => {
    if (containsPlatformConstant(path.node.test) && containsRequire(path.node)) {
      throwUnsupported("platform conditional require()", filePath, path.node.loc);
    }
  });

  root.find(j.CallExpression, { callee: { type: "Identifier", name: "require" } })
    .forEach((path) => {
      const source = getStaticRequireSource(path.node);
      if (source && isGuardedPotentialNativeRequire(path, source, filePath)) {
        throwUnsupported("guarded native module require()", filePath, path.node.loc);
      }
      if (isDynamicRequire(path.node)) {
        throwUnsupported("dynamic require()", filePath, path.node.loc);
      }
      throwUnsupported("require()", filePath, path.node.loc);
    });
}

function isComputedRequireMember(node) {
  return node.computed && Boolean(getStaticRequireSource(node.object));
}

function isDynamicRequire(node) {
  if (node.arguments.length !== 1) return true;
  return getStaticRequireSource(node) === null;
}

function containsRequire(node) {
  return containsAstNode(node, (node) => {
    return (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "require"
    );
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

function isGuardedPotentialNativeRequire(path, source, filePath) {
  return (
    isSharedCodePath(filePath) &&
    !isResolvableAppLocalSource(source, filePath) &&
    isPotentialNativeModuleSource(source) &&
    isUnderPlatformGuard(path)
  );
}

function shouldMigrateGuardedNativeRequireToDynamicImport(path, source, filePath) {
  return (
    isGuardedPotentialNativeRequire(path, source, filePath) &&
    isInsideAsyncFunction(path)
  );
}

function isResolvableAppLocalSource(source, filePath) {
  if (source.startsWith("~/")) return true;
  return normalizeAppLocalSource(source, filePath) !== source;
}

function isSharedCodePath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return !/(^|\/)(ios|iphone|android)(\/|$)/.test(normalized);
}

function isPotentialNativeModuleSource(source) {
  if (isJsonSource(source)) return false;
  if (source.startsWith(".") || source.startsWith("/")) return false;
  if (source.startsWith("alloy/")) return false;
  return true;
}

function isUnderPlatformGuard(path) {
  let current = path.parent;
  while (current?.node) {
    const node = current.node;
    if (node.type === "IfStatement" && containsPlatformConstant(node.test)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isInsideAsyncFunction(path) {
  let current = path.parent;
  while (current?.node) {
    if (isFunctionLikeNode(current.node)) {
      return current.node.async === true;
    }
    current = current.parent;
  }
  return false;
}

function isFunctionLikeNode(node) {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ObjectMethod" ||
    node.type === "ClassMethod" ||
    node.type === "ClassPrivateMethod"
  );
}

function containsPlatformConstant(node) {
  return containsAstNode(node, (node) => {
    return (
      node.type === "Identifier" &&
      (node.name === "OS_IOS" || node.name === "OS_ANDROID")
    );
  });
}

const IGNORED_AST_TRAVERSAL_KEYS = new Set([
  "comments",
  "end",
  "extra",
  "leadingComments",
  "loc",
  "range",
  "start",
  "tokens",
  "trailingComments",
]);

function containsAstNode(node, predicate, visited = new WeakSet()) {
  if (!isAstNode(node)) return false;
  if (visited.has(node)) return false;
  visited.add(node);

  if (predicate(node)) return true;

  for (const [key, value] of Object.entries(node)) {
    if (IGNORED_AST_TRAVERSAL_KEYS.has(key)) continue;

    if (Array.isArray(value)) {
      if (value.some((item) => containsAstNode(item, predicate, visited))) {
        return true;
      }
      continue;
    }

    if (containsAstNode(value, predicate, visited)) return true;
  }

  return false;
}

function isAstNode(value) {
  return Boolean(value) && typeof value === "object" && typeof value.type === "string";
}

function throwUnsupported(kind, filePath, loc) {
  const line = loc?.start?.line ?? 1;
  throw new Error(`Unsupported CommonJS ${kind} in ${filePath}:${line}.`);
}
