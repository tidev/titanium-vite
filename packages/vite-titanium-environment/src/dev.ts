import type { FetchFunctionOptions, FetchResult } from "vite/module-runner";
import type { DevEnvironmentContext, ResolvedConfig } from "vite";
import { DevEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

const FS_PREFIX = "/@fs";
const TITANIUM_BUILTIN_PREFIX = "/titanium:builtin:";

export function createTitaniumDevEnvironment(
  name: string,
  config: ResolvedConfig,
  context: DevEnvironmentContext,
) {
  /*
  const connection = {
    on(event: string, listener: () => void) {
      console.log("transport.on", event, listener);
    },
    send(data: HotPayload) {
      console.log("transport.send", data);
    },
  };

  const transport: HotChannel = {
    on: (event, listener) => {
      console.log("transport.on", event);
    },
    send: (data) => {
      console.log("transport.send", data);
    },
  };
  */

  const titaniumDevEnvironment = new TitaniumDevEnvironment(name, config, {
    ...context,
    options: {
      consumer: "client",
      optimizeDeps: {
        noDiscovery: false,
      },
      resolve: { builtins: [...nodeCompatBuiltins] },
      ...context.options,
    },
  });
  return titaniumDevEnvironment;
}

class TitaniumDevEnvironment extends DevEnvironment {
  override async fetchModule(
    id: string,
    importer?: string,
    options?: FetchFunctionOptions,
  ): Promise<FetchResult> {
    if (id.startsWith(TITANIUM_BUILTIN_PREFIX)) {
      return {
        externalize: id.slice(TITANIUM_BUILTIN_PREFIX.length),
        type: "builtin",
      };
    }

    if (!importer) {
      return super.fetchModule(id, importer, options);
    }

    const nodeModuleRequest = parseNodeModuleRequest(id);
    if (nodeModuleRequest) {
      const optimizedId = await this.resolveOptimizedDependency(
        nodeModuleRequest.importId,
        nodeModuleRequest.filePath,
      );
      if (optimizedId) {
        return super.fetchModule(optimizedId, importer, options);
      }
    }

    if (!isBareModuleRequest(id)) {
      return super.fetchModule(id, importer, options);
    }

    const resolved = await this.pluginContainer.resolveId(id, importer);
    if (!resolved) {
      return super.fetchModule(id, importer, options);
    }

    if (resolved.id.startsWith(TITANIUM_BUILTIN_PREFIX)) {
      return {
        externalize: resolved.id.slice(TITANIUM_BUILTIN_PREFIX.length),
        type: "builtin",
      };
    }

    const optimizedId = await this.resolveOptimizedDependency(id, resolved.id);
    if (optimizedId) {
      return super.fetchModule(optimizedId, importer, options);
    }

    return super.fetchModule(resolved.id, importer, options);
  }

  private async resolveOptimizedDependency(id: string, resolvedId: string) {
    const depsOptimizer = this.depsOptimizer;
    const cleanId = cleanUrl(resolvedId);
    if (
      !depsOptimizer ||
      depsOptimizer.isOptimizedDepFile(cleanId) ||
      !isNodeModuleJavaScript(cleanId)
    ) {
      return undefined;
    }

    const optimizedInfo = depsOptimizer.registerMissingImport(id, cleanId);
    depsOptimizer.run();
    await optimizedInfo.processing;
    return depsOptimizer.getOptimizedDepId(optimizedInfo);
  }
}

interface NodeModuleRequest {
  importId: string;
  filePath: string;
}

function isBareModuleRequest(id: string): boolean {
  return !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("file:");
}

function isNodeModuleJavaScript(id: string): boolean {
  return (
    id.includes("/node_modules/") &&
    (id.endsWith(".js") || id.endsWith(".mjs") || id.endsWith(".cjs"))
  );
}

function parseNodeModuleRequest(id: string): NodeModuleRequest | null {
  const filePath = normalizeFileRequest(id);
  if (!filePath || !isNodeModuleJavaScript(filePath)) {
    return null;
  }

  const importId = findPackageImportId(filePath);
  if (!importId) {
    return null;
  }

  return { importId, filePath };
}

function normalizeFileRequest(id: string): string | null {
  const cleanId = cleanUrl(id);
  if (cleanId.startsWith(FS_PREFIX)) {
    return cleanId.slice(FS_PREFIX.length);
  }

  if (cleanId.startsWith("/")) {
    return cleanId;
  }

  return null;
}

function findPackageImportId(filePath: string): string | null {
  const marker = "/node_modules/";
  const markerIndex = filePath.lastIndexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const packagePath = filePath.slice(markerIndex + marker.length);
  const parts = packagePath.split("/");
  const packageName = parts[0];
  if (!packageName) {
    return null;
  }

  if (!packageName.startsWith("@")) {
    return joinPackageImportId(packageName, parts.slice(1));
  }

  const scopedPackageName = parts[1];
  if (!scopedPackageName) {
    return null;
  }

  return joinPackageImportId(`${packageName}/${scopedPackageName}`, parts.slice(2));
}

function joinPackageImportId(packageId: string, subpathParts: string[]): string {
  const subpath = subpathParts.join("/");
  if (!subpath || isPackageEntrySubpath(subpath)) {
    return packageId;
  }

  return `${packageId}/${subpath}`;
}

function isPackageEntrySubpath(subpath: string): boolean {
  return subpath === "index.js" || subpath === "index.mjs" || subpath === "index.cjs";
}

function cleanUrl(id: string): string {
  const queryIndex = id.indexOf("?");
  if (queryIndex === -1) {
    return id;
  }

  return id.slice(0, queryIndex);
}
