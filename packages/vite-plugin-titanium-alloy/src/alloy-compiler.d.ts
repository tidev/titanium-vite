declare module "alloy-compiler" {
  import type { Platform } from "@titanium-sdk/vite-utils";

  export interface AlloyCompileConfig {
    alloyConfig: AlloyConfig;
    dir: {
      home: string;
      project: string;
      resources: string;
      resourcesAlloy: string;
    };
    theme: string;
    buildLog: unknown;
    backbone?: string;
    adapters?: string | string[];
  }

  export interface AlloyCompiler {
    config: AlloyCompileConfig;
    purgeStyleCache(id: string): void;
    compileComponent(options: { controllerContent: string; file: string }): {
      code: string;
      map: any;
      dependencies: string[];
    };
    compileModel(options: { file: string; content: string }): {
      code: string;
    };
  }

  export interface AlloyConfig {
    platform: Platform;
    deploytype: "development" | "production";
  }

  export interface CreateCompilerOptions {
    moduleFormat?: "cjs" | "esm";
    resolveModuleSpecifier?: (specifier: string) => string;
    compileConfig: {
      projectDir: string;
      alloyConfig: AlloyConfig;
    };
  }

  export function createCompiler(config: CreateCompilerOptions): AlloyCompiler;
}

declare module "alloy-compiler/lib/compilerUtils.js" {
  export function parseConfig(
    configFile: string,
    alloyConfig: Record<string, any>,
    config: Record<string, any>,
  ): void;
}

declare module "alloy-compiler/lib/compilerUtils.js" {
  export const compilerUtils: any;
}
