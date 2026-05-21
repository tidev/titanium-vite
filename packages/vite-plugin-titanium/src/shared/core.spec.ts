import type { HotPayload } from "vite";
import { afterEach, expect, test, vi } from "vitest";

import { createTitaniumFullReloadScheduler } from "./core.js";

afterEach(() => {
  vi.useRealTimers();
});

test("coalesces file changes into one Titanium full reload", () => {
  vi.useFakeTimers();
  const sentPayloads: HotPayload[] = [];
  const scheduler = createTitaniumFullReloadScheduler(100);

  scheduler.schedule(
    {
      hot: {
        send(payload: HotPayload) {
          sentPayloads.push(payload);
        },
      },
    },
    "/project/src/app.js",
  );
  scheduler.schedule(
    {
      hot: {
        send(payload: HotPayload) {
          sentPayloads.push(payload);
        },
      },
    },
    "/project/src/utils.js",
  );

  vi.advanceTimersByTime(99);
  expect(sentPayloads).toEqual([]);

  vi.advanceTimersByTime(1);
  expect(sentPayloads).toEqual([
    {
      type: "full-reload",
      path: "*",
      triggeredBy: "/project/src/utils.js",
    },
  ]);
});
