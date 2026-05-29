# Alloy Import Controller Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and validate the Alloy runtime `importController` helper in isolation before building any migration tooling.

**Architecture:** This slice only changes the Vite Alloy runtime overlay and the local Alloy example app. `Alloy.createController()` and `Widget.createController()` remain synchronous. `Alloy.importController()` and `Widget.importController()` are added as async helpers and verified against `apps/titanium-vite-alloy` in both normal build and serve mode.

**Tech Stack:** TypeScript, Vite plugin runtime patching, Vitest, Alloy example app, Titanium CLI, iOS simulator.

---

## File Structure

- `packages/vite-plugin-titanium-alloy/src/core.ts`: patch `/alloy` and `/alloy/widget` runtime modules with async controller import helpers.
- `packages/vite-plugin-titanium-alloy/src/core.spec.ts`: unit-test helper injection into the Alloy and widget runtimes.
- `apps/titanium-vite-alloy/app/controllers/index.js`: add a small runtime probe for `Alloy.importController()`.
- `apps/titanium-vite-alloy/app/widgets/com.titanium.esmWidget/controllers/widget.js`: add a small runtime probe for `Widget.importController()`.
- `docs/alloy-esm-migration-notes.md`: record the isolated helper contract after verification.

## Task 1: Add Runtime Helper Overlay

**Files:**
- Modify: `packages/vite-plugin-titanium-alloy/src/core.ts`
- Test: `packages/vite-plugin-titanium-alloy/src/core.spec.ts`

- [ ] **Step 1: Write failing helper overlay tests**

  Add these tests to `packages/vite-plugin-titanium-alloy/src/core.spec.ts` near the existing `patchForViteCompatibility()` tests:

  ```ts
  test("adds async importController to Alloy runtime", () => {
    const code = patchForViteCompatibility(`
      exports.createController = function(name, args) {
        var Controller = require('/alloy/controllers/' + name);
        return new Controller(args);
      };
    `);

    expect(code).toContain(
      "exports.importController = async function(name, args)",
    );
    expect(code).toContain("__alloyViteNormalizeControllerName(name)");
    expect(code).toContain("'/alloy/controllers/' + controllerName");
    expect(code).toContain("return new Controller(args);");
  });

  test("adds async importController to widget runtime", () => {
    const code = patchForViteCompatibility(`
      this.createController = function(name, args) {
        var Controller = require('/alloy/widgets/' + widgetId + '/controllers/' + name);
        return new Controller(args);
      };
    `);

    expect(code).toContain(
      "this.importController = async function(name, args)",
    );
    expect(code).toContain("__alloyViteNormalizeControllerName(name)");
    expect(code).toContain(
      "'/alloy/widgets/' + widgetId + '/controllers/' + controllerName",
    );
    expect(code).toContain("return new Controller(args);");
  });
  ```

- [ ] **Step 2: Run tests to verify failure**

  Run:

  ```bash
  pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test -- core.spec.ts
  ```

  Expected: the two new tests fail because `importController` is not injected yet.

- [ ] **Step 3: Implement helper source injection**

  In `packages/vite-plugin-titanium-alloy/src/core.ts`, add helper source constants above `patchForViteCompatibility()`:

  ```ts
  const alloyImportControllerHelpers = `
  function __alloyViteNormalizeControllerName(name) {
    return String(name).replace(/^\\/+/, "");
  }

  async function __alloyViteImportControllerModule(moduleId) {
    var mod = await import(moduleId);
    return mod && mod.default ? mod.default : mod;
  }
  `;

  const alloyImportControllerPatch = `
  exports.importController = async function(name, args) {
    var controllerName = __alloyViteNormalizeControllerName(name);
    var Controller = await __alloyViteImportControllerModule('/alloy/controllers/' + controllerName);
    return new Controller(args);
  };
  `;

  const widgetImportControllerPatch = `
  this.importController = async function(name, args) {
    var controllerName = __alloyViteNormalizeControllerName(name);
    var Controller = await __alloyViteImportControllerModule('/alloy/widgets/' + widgetId + '/controllers/' + controllerName);
    return new Controller(args);
  };
  `;
  ```

- [ ] **Step 4: Inject helpers without changing `createController`**

  In `patchForViteCompatibility()`, insert the helper source and runtime methods only when the matching runtime code exists:

  ```ts
  if (
    content.includes("exports.createController =") &&
    !content.includes("exports.importController =")
  ) {
    content = content.replace(
      "exports.createController =",
      `${alloyImportControllerHelpers}\n${alloyImportControllerPatch}\nexports.createController =`,
    );
  }

  if (
    content.includes("this.createController =") &&
    !content.includes("this.importController =")
  ) {
    content = content.replace(
      "this.createController =",
      `${alloyImportControllerHelpers}\n${widgetImportControllerPatch}\nthis.createController =`,
    );
  }
  ```

  Keep the existing `requireControllerExport()` behavior for `createController`.

- [ ] **Step 5: Run helper tests**

  Run:

  ```bash
  pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test -- core.spec.ts
  ```

  Expected: the new helper overlay tests pass with the existing core tests.

- [ ] **Step 6: Commit runtime helper**

  ```bash
  git add packages/vite-plugin-titanium-alloy/src/core.ts packages/vite-plugin-titanium-alloy/src/core.spec.ts
  git commit -m "feat(alloy): add async controller import helpers"
  ```

## Task 2: Add Example App Probe

**Files:**
- Modify: `apps/titanium-vite-alloy/app/controllers/index.js`
- Modify: `apps/titanium-vite-alloy/app/widgets/com.titanium.esmWidget/controllers/widget.js`

- [ ] **Step 1: Add widget helper probe**

  In `apps/titanium-vite-alloy/app/widgets/com.titanium.esmWidget/controllers/widget.js`, keep the existing sync child controller and add this export after `getMessage()`:

  ```js
  export async function getImportedChildMessage() {
    const importedChild = await Widget.importController("child", {
      source: "importController",
    });
    return importedChild.getMessage();
  }
  ```

- [ ] **Step 2: Add app helper probe**

  In `apps/titanium-vite-alloy/app/controllers/index.js`, add this function after `loadDynamicController()`:

  ```js
  async function loadImportControllerProbe() {
    const appController = await Alloy.importController("dynamic/hello", {
      source: "Alloy.importController",
    });
    console.log(
      `[alloy-import-controller] app helper: ${appController.getMessage()}`,
    );

    const widgetChildMessage = await authoredWidget.getImportedChildMessage();
    console.log(
      `[alloy-import-controller] widget helper: ${widgetChildMessage}`,
    );
  }
  ```

  Then add this call next to the existing `loadDynamicController()` call:

  ```js
  void loadImportControllerProbe().catch((error) => {
    console.log("[alloy-import-controller] helper probe failed", error);
  });
  ```

- [ ] **Step 3: Build packages**

  Run:

  ```bash
  pnpm build
  ```

  Expected: TypeScript build exits 0.

- [ ] **Step 4: Commit example probe**

  ```bash
  git add apps/titanium-vite-alloy/app/controllers/index.js apps/titanium-vite-alloy/app/widgets/com.titanium.esmWidget/controllers/widget.js
  git commit -m "test(alloy): exercise async controller import helpers"
  ```

## Task 3: Verify With Alloy Example App

**Files:**
- App under test: `apps/titanium-vite-alloy`
- Runtime log artifact: `/private/tmp/titanium-vite-alloy-import-controller.log`
- Screenshot artifact: `/private/tmp/titanium-vite-alloy-import-controller.png`

- [ ] **Step 1: Validate normal Titanium build**

  From `apps/titanium-vite-alloy`, run elevated:

  ```bash
  ti build -p ios
  ```

  Expected: the app launches and logs both lines:

  ```text
  [alloy-import-controller] app helper: hello from Alloy.importController
  [alloy-import-controller] widget helper: child importController
  ```

- [ ] **Step 2: Validate Titanium serve mode**

  If the serve port is blocked, identify and kill the old listener:

  ```bash
  lsof -nP -iTCP:8323 -sTCP:LISTEN
  kill <pid>
  ```

  From `apps/titanium-vite-alloy`, run elevated:

  ```bash
  ti serve ios
  ```

  Expected: the app launches and logs both helper-probe lines from Step 1. Startup should not fetch unrelated app controllers before the probe runs.

- [ ] **Step 3: Capture simulator screenshot**

  Run:

  ```bash
  xcrun simctl io booted screenshot /private/tmp/titanium-vite-alloy-import-controller.png
  ```

  Expected: screenshot shows the Alloy example app window, not a blank white screen.

- [ ] **Step 4: Record verification notes**

  Add a short working note or PR summary with:

  ```md
  Verification:
  - pnpm build: pass
  - alloy plugin core tests: pass
  - apps/titanium-vite-alloy ti build -p ios: pass/fail with log path
  - apps/titanium-vite-alloy ti serve ios: pass/fail with log path
  - simulator screenshot: /private/tmp/titanium-vite-alloy-import-controller.png
  ```

## Task 4: Document Helper Contract

**Files:**
- Modify: `docs/alloy-esm-migration-notes.md`

- [ ] **Step 1: Add helper contract note**

  Add this note to `docs/alloy-esm-migration-notes.md`:

  ```md
  ## Async Controller Import Helper

  `Alloy.createController()` and `Widget.createController()` remain synchronous composition APIs. The Vite Alloy runtime overlay adds `Alloy.importController()` and `Widget.importController()` for async runtime loading boundaries. The helper returns a normal Alloy controller instance after the module has loaded; controller instance APIs such as `getView()`, `getViewEx()`, `addTopLevelView()`, and `updateViews()` remain synchronous.

  The helper contract was first verified against `apps/titanium-vite-alloy` in normal `ti build -p ios` and `ti serve ios` before starting app migration tooling.
  ```

- [ ] **Step 2: Commit helper docs**

  ```bash
  git add docs/alloy-esm-migration-notes.md
  git commit -m "docs(alloy): document async controller import helper"
  ```

## Self-Review

- Spec coverage: this plan covers only the actual Alloy runtime helper change and local example-app verification.
- Placeholder scan: no `TBD`, `TODO`, or undefined task dependencies.
- Type consistency: helper names are consistently `Alloy.importController()` and `Widget.importController()`.
- Boundary check: scanner, codemod, LLM prompt, and Lambus migration work are intentionally excluded and moved to the migration plan.
