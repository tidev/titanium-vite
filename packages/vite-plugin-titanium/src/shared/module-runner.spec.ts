import { expect, test } from "vitest";

import { createDevModuleRunnerCode } from "./module-runner.js";

test("generated dev runner connects to Vite HMR and restarts Titanium on hot payloads", () => {
  const code = createDevModuleRunnerCode({
    devServerHmrPath: "/",
    devServerOrigin: "http://127.0.0.1:8323",
    devModulePreloads: [],
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

test("generated dev runner strips node protocol before Titanium require", () => {
  const code = createDevModuleRunnerCode({
    devServerHmrPath: "/",
    devServerOrigin: "http://127.0.0.1:8323",
    devModulePreloads: [],
    webSocketToken: "token",
  });

  expect(code).toContain(
    "const mod = nativeRequire(normalizeExternalModuleId(filepath));",
  );
  expect(code).toContain("return id.startsWith(\"node:\") ? id.slice(5) : id;");
});

test("generated dev runner resolves preloaded modules for Titanium require", () => {
  const code = createDevModuleRunnerCode({
    devServerHmrPath: "/",
    devServerOrigin: "http://127.0.0.1:8323",
    devModulePreloads: ["/alloy/controllers/index"],
    webSocketToken: "token",
  });

  expect(code).toContain(
    'const devModulePreloads = ["/alloy/controllers/index"];',
  );
  expect(code).toContain(
    "global.require = createViteAwareRequire(moduleRunner, nativeRequire);",
  );
  expect(code).toContain("await preloadDevModules(moduleRunner);");
  expect(code).toContain("moduleRunner.evaluatedModules.getModuleByUrl(candidate)");
  expect(code).toContain("const preloadedModuleExports = Object.create(null);");
  expect(code).toContain(
    "rememberPreloadedModule(moduleId, await moduleRunner.import(moduleId));",
  );
  expect(code).toContain("function isAlloyFactoryModule(id)");
  expect(code).toContain("return mod.default;");
});
