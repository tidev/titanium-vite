import path from "node:path";
import type { TiBridgeApi } from "@titanium/vite-utils";
import type { ESTree } from "rolldown/utils";
import type { Plugin, ResolvedConfig } from "vite";
import { cleanUrl, TI_BRIDGE_PLUGIN_NAME } from "@titanium/vite-utils";
import { normalizePath, parseSync, Visitor } from "vite";

function memberToString(node: ESTree.Node): string | null {
  if (node.type === "Identifier") return node.name;

  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;

  if (node.type !== "MemberExpression") return null;

  const obj = memberToString(node.object);
  const prop = memberToString(node.property);
  if (obj == null || prop == null) return null;
  return `${obj}.${prop}`;
}

function isTiSymbol(expr: string): boolean {
  return expr.startsWith("Ti.") || expr.startsWith("Titanium.");
}

export function tiSymbolsPlugin(): Plugin {
  let bridge: TiBridgeApi;
  let config: ResolvedConfig;
  const symbolsByFile = new Map<string, Set<string>>();

  return {
    name: "titanium:ti-symbols",
    apply: "build",
    enforce: "post",

    buildStart() {
      symbolsByFile.clear();
    },

    configResolved(c) {
      config = c;
      const bridgePlugin = c.plugins.find(
        (p) => p.name === TI_BRIDGE_PLUGIN_NAME,
      );
      if (!bridgePlugin)
        throw new Error(`"${TI_BRIDGE_PLUGIN_NAME}" plugin not found.`);
      bridge = bridgePlugin.api as TiBridgeApi;
    },

    transform(code, id) {
      const cleanId = cleanUrl(id);
      if (!/\.[cm]?[jt]sx?$/.test(cleanId)) return;
      if (cleanId.includes("/node_modules/")) return;

      // Rolldown removed `info.ast` from `moduleParsed`. We own the parse step
      // via `parseSync` (re-exported from `vite`, sourced from `rolldown/utils`).
      const result = parseSync(cleanId, code);
      const file = normalizePath(path.relative(config.root, cleanId));
      const fileSymbols = new Set<string>();

      new Visitor({
        MemberExpression(node) {
          if (node.object.type === "Literal") return;
          const expr = memberToString(node);
          if (expr && isTiSymbol(expr)) fileSymbols.add(expr);
        },
      }).visit(result.program);

      symbolsByFile.set(file, fileSymbols);
      return null;
    },

    closeBundle() {
      const tiSymbols: Record<string, string[]> = {};
      for (const [file, set] of symbolsByFile) {
        tiSymbols[file] = [...set].sort();
      }

      bridge.reportTiApiUsage(tiSymbols);
    },
  };
}
