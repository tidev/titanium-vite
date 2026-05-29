import { expect, test } from "vitest";

import {
  patchModuleFactoryInterop,
  patchWidgetImportControllerRuntime,
} from "./component.js";

test("routes module factory lookups through the interop helper", () => {
  const code = [
    'import * as applesignin from "applesignin";',
    "$.__views.appleLoginButton = (applesignin.createLoginButton || Ti.UI.createLoginButton)({});",
  ].join("\n");

  expect(patchModuleFactoryInterop(code)).toContain(
    'import { __alloyViteGetInteropProperty } from "virtual:titanium/alloy-interop";',
  );
  expect(patchModuleFactoryInterop(code)).toContain(
    '__alloyViteGetInteropProperty(applesignin, "createLoginButton") || Ti.UI.createLoginButton',
  );
});

test("routes app-local module factories through the same helper", () => {
  const code = [
    'import * as xp_ui from "~/lib/xp.ui";',
    "$.__views.actionButton = (xp_ui.createActionButton || Ti.UI.createActionButton)({});",
  ].join("\n");

  expect(patchModuleFactoryInterop(code)).toContain(
    '__alloyViteGetInteropProperty(xp_ui, "createActionButton") || Ti.UI.createActionButton',
  );
});

test("does not import the helper when no module factories are rewritten", () => {
  const code = [
    'import * as xp_ui from "~/lib/xp.ui";',
    "xp_ui.createActionButton({});",
  ].join("\n");

  expect(patchModuleFactoryInterop(code)).toBe(code);
});

test("adds widget runtime binding for authored Widget.importController calls", () => {
  const code = [
    "export async function getImportedChildMessage() {",
    '  const importedChild = await Widget.importController("child", {});',
    "  return importedChild.getMessage();",
    "}",
  ].join("\n");

  expect(
    patchWidgetImportControllerRuntime(code, "com.titanium.esmWidget"),
  ).toContain('const Widget = new __alloyViteCreateWidget("com.titanium.esmWidget");');
});

test("does not add widget runtime binding outside widget controllers", () => {
  const code = 'const importedChild = await Widget.importController("child", {});';

  expect(patchWidgetImportControllerRuntime(code, undefined)).toBe(code);
});
