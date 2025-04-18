import type { ResolvedConfig } from "vite";
import { BuildEnvironment } from "vite";

export function createTitaniumBuildEnvironment(
  name: string,
  config: ResolvedConfig,
) {
  return new BuildEnvironment(name, config, {
    options: {
      consumer: "client",
      build: {
        outDir: "Resources",
        lib: {
          name: "app",
          entry: ["./src/app.js"],
          fileName: (format, entryName) => `${entryName}.js`,
          formats: ["cjs"],
        },
      },
    },
  });
}
