import path from "node:path";
import type { FetchFunctionOptions, FetchResult } from "vite/module-runner";
import type {
  DevEnvironmentContext,
  EnvironmentOptions,
  ResolvedConfig,
} from "vite";
import { DevEnvironment } from "vite";

import { nodeCompatBuiltins } from "./constants.js";

const FS_PREFIX = "/@fs";
const ROOT_NODE_MODULES_PREFIX = "/node_modules/";
const VALID_ID_PREFIX = "/@id/";
const NULL_BYTE_PLACEHOLDER = "__x00__";

type EnvironmentBuiltin = string | RegExp;

export function createTitaniumDevEnvironment(
  name: string,
  config: ResolvedConfig,
  context: DevEnvironmentContext,
) {
  const environmentOptions = config.environments[name] ?? context.options;
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
    options: createTitaniumDevEnvironmentOptions(environmentOptions),
  });
  return titaniumDevEnvironment;
}

export function createTitaniumDevEnvironmentOptions(
  options: EnvironmentOptions = {},
): EnvironmentOptions {
  return {
    ...options,
    consumer: "client",
    optimizeDeps: {
      ...options.optimizeDeps,
      noDiscovery: false,
    },
    resolve: {
      ...options.resolve,
      builtins: [...nodeCompatBuiltins, ...(options.resolve?.builtins ?? [])],
    },
  };
}

class TitaniumDevEnvironment extends DevEnvironment {
  override async fetchModule(
    id: string,
    importer?: string,
    options?: FetchFunctionOptions,
  ): Promise<FetchResult> {
    const builtinId = resolveEnvironmentBuiltinId(
      id,
      this.config.resolve.builtins,
    );
    if (builtinId) {
      return {
        externalize: builtinId,
        type: "builtin",
      };
    }

    if (!importer) {
      return super.fetchModule(id, importer, options);
    }

    const nodeModuleRequest = parseNodeModuleRequest(id, this.config.root);
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
      isDependencyOptimizationExcluded(id, depsOptimizer.options.exclude) ||
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

export function isDependencyOptimizationExcluded(
  id: string,
  exclude: readonly string[] | undefined,
): boolean {
  return exclude?.includes(id) ?? false;
}

interface NodeModuleRequest {
  importId: string;
  filePath: string;
}

function isBareModuleRequest(id: string): boolean {
  return !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("file:");
}

export function resolveEnvironmentBuiltinId(
  id: string,
  builtins: readonly EnvironmentBuiltin[],
): string | null {
  const unwrappedId = unwrapViteId(id);
  const isBuiltin = builtins.some((builtin) =>
    typeof builtin === "string" ? builtin === unwrappedId : builtin.test(unwrappedId),
  );
  return isBuiltin ? unwrappedId : null;
}

function unwrapViteId(id: string): string {
  if (!id.startsWith(VALID_ID_PREFIX)) {
    return id;
  }

  return id
    .slice(VALID_ID_PREFIX.length)
    .replace(NULL_BYTE_PLACEHOLDER, "\0");
}

function isNodeModuleJavaScript(id: string): boolean {
  return (
    id.includes("/node_modules/") &&
    (id.endsWith(".js") || id.endsWith(".mjs") || id.endsWith(".cjs"))
  );
}

function parseNodeModuleRequest(id: string, root: string): NodeModuleRequest | null {
  const filePath = normalizeNodeModuleFileRequest(id, root);
  if (!filePath || !isNodeModuleJavaScript(filePath)) {
    return null;
  }

  const importId = findPackageImportId(filePath);
  if (!importId) {
    return null;
  }

  return { importId, filePath };
}

export function normalizeNodeModuleFileRequest(
  id: string,
  root: string,
): string | null {
  const cleanId = cleanUrl(id);
  if (cleanId.startsWith(FS_PREFIX)) {
    return cleanId.slice(FS_PREFIX.length);
  }

  if (cleanId.startsWith(ROOT_NODE_MODULES_PREFIX)) {
    return path.join(root, cleanId);
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
