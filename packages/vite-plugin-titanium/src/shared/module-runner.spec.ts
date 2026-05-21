import { expect, test } from "vitest";

import { createDevModuleRunnerCode } from "./module-runner.js";

test("generated dev runner connects to Vite HMR and restarts Titanium on hot payloads", () => {
  const code = createDevModuleRunnerCode({
    devServerHmrPath: "/",
    devServerOrigin: "http://127.0.0.1:8323",
    webSocketToken: "token",
  });

  expect(code).toContain('import WebSocket from "tiws"');
  expect(code).toContain(
    'new WebSocket(createHmrUrl(devServerOrigin, devServerHmrPath, webSocketToken), "vite-hmr")',
  );
  expect(code).toContain(
    'console.log("[titanium] Vite HMR transport connected")',
  );
  expect(code).toContain(
    'console.log("[titanium] Vite full reload received, restarting app")',
  );
  expect(code).toContain(
    'payload.type === "full-reload" || payload.type === "update"',
  );
  expect(code).toContain("Ti.App._restart()");
});
