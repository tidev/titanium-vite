"use strict";

module.exports = function migrateWidgetWpathRequires(fileInfo, api) {
  const widgetId = getWidgetId(fileInfo.path);
  if (!widgetId) return fileInfo.source;

  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  root.find(j.Program).forEach((programPath) => {
    const body = programPath.node.body;

    for (let index = 0; index < body.length; index += 1) {
      const statement = body[index];
      if (statement.type !== "VariableDeclaration") continue;
      if (statement.declarations.length !== 1) continue;

      const declaration = statement.declarations[0];
      if (!declaration) continue;
      if (declaration.id.type !== "Identifier") continue;

      const wpathValue = getRequireWpathValue(declaration.init);
      if (!wpathValue) continue;

      const importDeclaration = j.importDeclaration(
        [j.importNamespaceSpecifier(j.identifier(declaration.id.name))],
        j.literal(`/alloy/widgets/${widgetId}/lib/${wpathValue}`),
      );
      importDeclaration.comments = statement.comments;
      body[index] = importDeclaration;
    }
  });

  return root.toSource({ quote: "double" });
};

module.exports.parser = "babel";

function getWidgetId(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const match = normalizedPath.match(/(?:^|\/)app\/widgets\/([^/]+)\/controllers\//);
  return match?.[1] ?? null;
}

function getRequireWpathValue(node) {
  if (!node || node.type !== "CallExpression") return null;
  if (node.callee.type !== "Identifier" || node.callee.name !== "require") {
    return null;
  }
  if (node.arguments.length !== 1) return null;

  const argument = node.arguments[0];
  if (!argument || argument.type !== "CallExpression") return null;
  if (argument.callee.type !== "Identifier" || argument.callee.name !== "WPATH") {
    return null;
  }
  if (argument.arguments.length !== 1) return null;

  const wpathArgument = argument.arguments[0];
  if (!wpathArgument) return null;
  if (wpathArgument.type === "StringLiteral") return wpathArgument.value;
  if (wpathArgument.type === "Literal" && typeof wpathArgument.value === "string") {
    return wpathArgument.value;
  }
  return null;
}
