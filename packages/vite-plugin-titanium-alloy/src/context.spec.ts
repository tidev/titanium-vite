import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

import { resolveAlloyModuleSpecifier } from "./context.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function createAppDir(): string {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "alloy-app-"));
  const appDir = path.join(projectDir, "app");
  fs.mkdirSync(path.join(appDir, "lib"), { recursive: true });
  tempDirs.push(projectDir);
  return appDir;
}

test("resolves Alloy XML module ids to app-local alias imports", () => {
  const appDir = createAppDir();
  fs.writeFileSync(path.join(appDir, "lib", "xp.ui.js"), "");

  expect(resolveAlloyModuleSpecifier("xp.ui", appDir)).toBe("~/lib/xp.ui");
});

test("preserves native and package module ids when no app-local module exists", () => {
  const appDir = createAppDir();

  expect(resolveAlloyModuleSpecifier("ti.map", appDir)).toBe("ti.map");
  expect(resolveAlloyModuleSpecifier("@scope/package", appDir)).toBe(
    "@scope/package",
  );
});

test("preserves Vite-native module specifiers", () => {
  const appDir = createAppDir();

  expect(resolveAlloyModuleSpecifier("~/lib/xp.ui", appDir)).toBe(
    "~/lib/xp.ui",
  );
  expect(resolveAlloyModuleSpecifier("./xp.ui", appDir)).toBe("./xp.ui");
});
