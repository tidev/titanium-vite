import path from "node:path";
import type { Plugin } from "vite";

import type { AlloyContext } from "./context.js";
import { assertNoLegacyCommonJsExport } from "./commonjs-exports.js";

const modelRE = /(?:[/\\]widgets[/\\][^/\\]+)?[/\\]models[/\\](.*)/;

export function modelPlugin(ctx: AlloyContext): Plugin {
  return {
    name: "titanium:alloy:model",

    async resolveId(id, importer) {
      if (modelRE.test(id)) {
        const result = await this.resolve(
          path.join(ctx.appDir, id.replace(/\/alloy\//, "")),
          importer,
          { skipSelf: true },
        );
        if (result) {
          return result.id;
        }
      }
    },

    transform(code, id) {
      if (modelRE.test(id)) {
        assertNoLegacyCommonJsExport(code, id, "model");
        const { code: modelCode } = ctx.compiler.compileModel({
          file: id,
          content: code,
        });

        return modelCode;
      }
    },
  };
}
