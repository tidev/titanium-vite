import path from "path";
import type { Plugin } from "vite";
import { XMLParser } from "fast-xml-parser";
import { normalizePath } from "vite";

import type { ProjectType } from "@titanium-sdk/vite-utils";

const I18N_PUBLIC_PATH = "/@titanium/i18n/";

/**
 *
 */
export function i18nPlugin(
  projectDir: string,
  projectType: ProjectType,
): Plugin {
  const i18nDir =
    projectType === "alloy"
      ? path.join(projectDir, "app/i18n")
      : path.join(projectDir, "i18n");
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
  });

  return {
    name: "titanium:i18n",
    resolveId(id) {
      id = normalizePath(id);
      if (id.startsWith(I18N_PUBLIC_PATH)) {
        return path.join(i18nDir, id.replace(I18N_PUBLIC_PATH, ""));
      }
    },
    transform(code, id) {
      id = normalizePath(id);
      if (id.startsWith(i18nDir)) {
        const messages: Record<string, string> = {};
        const result = xmlParser.parse(code) as {
          resources?: {
            string?: {
              "@_name": string;
              "#text": string;
            }[];
          };
        };
        if (result.resources) {
          let stringNodes = result.resources.string ?? [];
          if (!Array.isArray(stringNodes)) {
            stringNodes = [stringNodes];
          }
          for (const node of stringNodes) {
            const key = node["@_name"];
            const value = node["#text"];
            messages[key] = value;
          }

          return `export default ${JSON.stringify(messages)}`;
        }
      }
    },
  };
}
