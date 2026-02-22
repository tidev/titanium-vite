import path from "node:path";
import type { TiBridgeApi } from "@titanium/vite-utils";
import type { MemberExpression, Node } from "estree";
import type { AstNode } from "rollup";
import type { Plugin, ResolvedConfig } from "vite";
import { cleanUrl, TI_BRIDGE_PLUGIN_NAME } from "@titanium/vite-utils";
import { normalizePath } from "vite";

function walk(node: AstNode, visit: (n: AstNode) => void) {
  visit(node);
  for (const key of Object.keys(node)) {
    const v = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      for (const c of v) walk(c as AstNode, visit);
    } else if (
      v != null &&
      typeof v === "object" &&
      typeof (v as AstNode).type === "string"
    ) {
      walk(v as AstNode, visit);
    }
  }
}

function memberToString(node: Node): string | null {
  if (node.type === "Identifier") return node.name;

  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;

  if (node.type !== "MemberExpression") return null;

  const obj = memberToString(node.object as Node);
  const prop = memberToString(node.property as Node);
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

    moduleParsed(info) {
      const id = cleanUrl(info.id);
      if (!/\.[cm]?[jt]sx?$/.test(id)) return;
      if (id.includes("/node_modules/")) return;
      if (!info.ast) return;

      const file = normalizePath(path.relative(config.root, id));
      const fileSymbols = new Set<string>();

      walk(info.ast as unknown as AstNode, (node) => {
        if (node.type !== "MemberExpression") return;
        const me = node as unknown as MemberExpression;
        if (me.object.type === "Literal") return;

        const expr = memberToString(node as unknown as Node);
        if (!expr) return;

        if (isTiSymbol(expr)) fileSymbols.add(expr);
      });

      symbolsByFile.set(file, fileSymbols);
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
