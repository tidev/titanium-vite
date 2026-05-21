import type { HotChannel } from "vite";

/**
 * Reuse Vite's websocket server as the Titanium environment hot transport,
 * while keeping environment-specific invoke handlers isolated.
 */
export function createTitaniumHotTransport(
  viteHotChannel: HotChannel,
): HotChannel {
  return {
    send(payload) {
      viteHotChannel.send?.(payload);
    },
    listen() {
      // The shared Vite websocket is already owned by the dev server.
    },
    close() {
      // Do not close the shared websocket when the Titanium environment closes.
    },
  };
}
