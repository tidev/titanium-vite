import type { HotChannel, HotPayload } from "vite";
import { expect, test, vi } from "vitest";

import { createTitaniumHotTransport } from "./hot.js";

test("delegates hot payloads to the shared Vite websocket", () => {
  const sentPayloads: HotPayload[] = [];
  const sharedSocket: HotChannel = {
    send(payload) {
      sentPayloads.push(payload);
    },
  };

  const transport = createTitaniumHotTransport(sharedSocket);
  transport.send?.({ type: "full-reload", path: "*" });

  expect(sentPayloads).toEqual([{ type: "full-reload", path: "*" }]);
});

test("does not close the shared Vite websocket when the environment closes", () => {
  const close = vi.fn();
  const sharedSocket: HotChannel = {
    close,
  };

  const transport = createTitaniumHotTransport(sharedSocket);
  void transport.close?.();

  expect(close).not.toHaveBeenCalled();
});
