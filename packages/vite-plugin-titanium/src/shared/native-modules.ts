import createDebugger from "debug";
import type { TiBridgeApi } from "@titanium/vite-utils";
import type { Plugin } from "vite";
import { TI_BRIDGE_PLUGIN_NAME } from "@titanium/vite-utils";

const debug = createDebugger("titanium:vite:bridge");

/**
 * Externalize Titanium native module IDs declared in `tiapp.xml`'s `<modules>`
 * block (e.g. `ti.editor`, `dk.napp.social`).
 *
 * These IDs are bare specifiers that look like regular npm packages to Vite,
 * so without this plugin Rolldown's resolver tries to find them on disk, fails,
 * and aborts the build. Titanium's runtime CJS loader resolves them at runtime
 * via its native module registry, so we leave the bare specifier intact and
 * mark it external.
 *
 * The list is sourced from the Titanium CLI via the `ti-vite-bridge` plugin's
 * `context.nativeModules` — already filtered to the active build platform.
 *
 * Must run before `titanium:force-bundle`, which would otherwise call
 * `require.resolve()` on the bare ID and return `null` (silently) — leaving
 * Rolldown to error out at the default resolver.
 */
export function nativeModulesPlugin(): Plugin {
  let context: TiBridgeApi["context"] | undefined;
  let nativeModules = new Set<string>();

  return {
    name: "titanium:native-modules",
    enforce: "pre",

    configResolved(config) {
      const bridgePlugin = config.plugins.find(
        (p) => p.name === TI_BRIDGE_PLUGIN_NAME,
      );
      if (!bridgePlugin)
        throw new Error(`"${TI_BRIDGE_PLUGIN_NAME}" plugin not found.`);
      const bridge = bridgePlugin.api as TiBridgeApi;
      context = bridge.context;
      nativeModules = new Set(context.nativeModules);
    },

    // `buildStart` is per-environment. `corePlugin.builder.buildApp` only builds
    // the `titanium` env, so this fires exactly once per build. The explicit
    // env-name check keeps that guarantee if the build flow ever changes.
    buildStart() {
      if (this.environment.name !== "titanium") return;
      if (!context) return;
      const { platform, deployType, target } = context;
      debug(
        "bridge context: platform=%s deployType=%s target=%s nativeModules=%d",
        platform,
        deployType,
        target ?? "<none>",
        nativeModules.size,
      );
      for (const id of nativeModules) debug("  externalize %s", id);
    },

    resolveId(id) {
      if (!nativeModules.has(id)) return;
      debug("resolve %s -> external", id);
      return { id, external: true, moduleSideEffects: false };
    },
  };
}
