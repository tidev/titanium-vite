import fs from "node:fs";
import path from "node:path";
import type { Platform } from "@titanium-sdk/vite-utils";
import type { Plugin } from "vite";

const VIRTUAL_PREFIX = "\0virtual:titanium/classic-bootstrap-entry:";

interface BootstrapEntries {
  byChunk: Record<string, string>;
  byVirtualId: Record<string, string>;
}

interface BootstrapCandidate {
  filePath: string;
  name: string;
  platform: Platform | "base";
}

export function bootstrapPlugin(platform: Platform): Plugin {
  let entries: BootstrapEntries = { byChunk: {}, byVirtualId: {} };

  return {
    name: "titanium:classic:bootstrap",
    apply: "build",
    enforce: "pre",

    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      entries = collectBootstrapEntries(path.join(root, "src"), platform);
      return {
        build: {
          rolldownOptions: {
            input: entries.byChunk,
          },
        },
      };
    },

    resolveId(id) {
      const filePath = entries.byVirtualId[id];
      if (filePath) return filePath;
    },
  };
}

export function collectBootstrapEntries(
  sourceRoot: string,
  platform: Platform,
): BootstrapEntries {
  const files = new Map<string, string>();

  for (const candidate of collectBootstrapCandidates(sourceRoot)) {
    if (candidate.platform !== "base" && candidate.platform !== platform) {
      continue;
    }
    files.set(candidate.name, candidate.filePath);
  }

  const byChunk: Record<string, string> = {};
  const byVirtualId: Record<string, string> = {};
  for (const [name, filePath] of files) {
    const virtualId = `${VIRTUAL_PREFIX}${name}`;
    byChunk[name] = virtualId;
    byVirtualId[virtualId] = filePath;
  }

  return { byChunk, byVirtualId };
}

function collectBootstrapCandidates(
  sourceRoot: string,
): BootstrapCandidate[] {
  const candidates: BootstrapCandidate[] = [];

  const walk = (currentDir: string, relBase = "") => {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isLegacyPlatformDirectory(entry.name)) continue;
        walk(path.join(currentDir, entry.name), path.join(relBase, entry.name));
        continue;
      }

      const parsed = parseBootstrapFileName(entry.name);
      if (!parsed) continue;

      candidates.push({
        filePath: path.join(currentDir, entry.name),
        name: path.join(relBase, parsed.name).replace(/\\/g, "/"),
        platform: parsed.platform,
      });
    }
  };

  walk(sourceRoot);
  return candidates;
}

function parseBootstrapFileName(
  fileName: string,
): { name: string; platform: BootstrapCandidate["platform"] } | undefined {
  const match = /^(?<base>.+\.bootstrap)(?:\.(?<platform>ios|android))?\.(?:js|ts)$/.exec(
    fileName,
  );
  const groups = match?.groups;
  if (!groups) return undefined;

  const name = groups.base;
  if (!name) return undefined;

  const platform = parsePlatform(groups.platform);
  if (!platform) return undefined;

  return { name, platform };
}

function parsePlatform(
  value: string | undefined,
): BootstrapCandidate["platform"] | undefined {
  if (value === undefined) return "base";
  if (value === "ios" || value === "android") return value;
  return undefined;
}

function isLegacyPlatformDirectory(name: string): boolean {
  return name === "android" || name === "ios" || name === "iphone";
}
