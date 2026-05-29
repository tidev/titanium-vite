# Alloy Controller Boundary Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit async controller-loading boundary for Alloy navigation/runtime flows, classify existing `createController` usage, and verify the approach by migrating a temporary Lambus `main` checkout and comparing it to `vite-build`.

**Architecture:** `Alloy.createController()` and `Widget.createController()` remain sync composition APIs that may be statically imported. `Alloy.importController()` and `Widget.importController()` become async route/runtime APIs. A scanner/codemod provides syntax-based categories, while an LLM upgrade prompt applies project intent to decide which runtime-boundary candidates should migrate.

**Tech Stack:** TypeScript, Vite plugin transforms, Alloy runtime overlay, jscodeshift codemod, Vitest, Titanium CLI, Lambus iOS simulator validation.

---

## File Structure

- `packages/vite-plugin-titanium-alloy/src/core.ts`: patch `/alloy` and `/alloy/widget` runtime modules with async import helpers in Vite mode.
- `packages/vite-plugin-titanium-alloy/src/core.spec.ts`: assert helper overlay output and name normalization behavior.
- `packages/vite-codemod/src/index.ts`: register `classify-alloy-controllers`.
- `packages/vite-codemod/src/cli.ts`: keep existing `--check`/dry-run behavior; no CLI redesign.
- `packages/vite-codemod/transforms/classify-alloy-controllers.cjs`: scan and classify `Alloy.createController()` / `Widget.createController()` call sites; rewrite only high-confidence runtime-boundary calls when configured.
- `packages/vite-codemod/transforms/classify-alloy-controllers.spec.mjs`: cover classification categories and check output.
- `packages/vite-codemod/README.md`: document the scanner, categories, and why it does not infer app-specific navigation intent.
- `docs/ai-prompts/alloy-controller-boundary-migration.md`: LLM-guided upgrade prompt for intent-sensitive migration.
- `docs/alloy-esm-migration-notes.md`: document `createController` as sync composition and `importController` as async runtime loading.
- `docs/superpowers/specs/2026-05-29-alloy-async-controller-loading.md`: keep aligned with the final boundary model.

## Task 1: Add Runtime Helper Overlay

**Files:**
- Modify: `packages/vite-plugin-titanium-alloy/src/core.ts`
- Test: `packages/vite-plugin-titanium-alloy/src/core.spec.ts`

- [ ] **Step 1: Write failing helper overlay tests**

  Add tests to `packages/vite-plugin-titanium-alloy/src/core.spec.ts`:

  ```ts
  import { expect, test } from "vitest";
  import { patchForViteCompatibility } from "./core.js";

  test("adds async importController to Alloy runtime", () => {
    const source = "exports.createController = function(name, args) { return new (require('/alloy/controllers/' + name))(args); };";
    const code = patchForViteCompatibility(source);

    expect(code).toContain("exports.importController = async function(name, args)");
    expect(code).toContain("__alloyViteNormalizeControllerName(name)");
    expect(code).toContain("return new Controller(args);");
  });

  test("adds async importController to widget runtime", () => {
    const source = "this.createController = function(name, args) { return new (require('/alloy/widgets/' + widgetId + '/controllers/' + name))(args); };";
    const code = patchForViteCompatibility(source);

    expect(code).toContain("this.importController = async function(name, args)");
    expect(code).toContain("__alloyViteNormalizeControllerName(name)");
    expect(code).toContain("'/alloy/widgets/' + widgetId + '/controllers/' +");
  });
  ```

- [ ] **Step 2: Run tests to verify failure**

  Run:

  ```bash
  pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test -- core.spec.ts
  ```

  Expected: both new tests fail because `importController` is not injected yet.

- [ ] **Step 3: Implement helper overlay**

  In `packages/vite-plugin-titanium-alloy/src/core.ts`, extend `patchForViteCompatibility()` with string patches for the Alloy runtime and widget runtime. Use helper source shaped like:

  ```js
  function __alloyViteNormalizeControllerName(name) {
    return String(name).replace(/^\/+/, "");
  }

  async function __alloyViteImportControllerModule(moduleId) {
    const mod = await import(moduleId);
    return mod && mod.default ? mod.default : mod;
  }
  ```

  Patch Alloy runtime after `exports.createController`:

  ```js
  exports.importController = async function(name, args) {
    var controllerName = __alloyViteNormalizeControllerName(name);
    var Controller = await __alloyViteImportControllerModule('/alloy/controllers/' + controllerName);
    return new Controller(args);
  };
  ```

  Patch widget runtime after `this.createController`:

  ```js
  this.importController = async function(name, args) {
    var controllerName = __alloyViteNormalizeControllerName(name);
    var Controller = await __alloyViteImportControllerModule('/alloy/widgets/' + widgetId + '/controllers/' + controllerName);
    return new Controller(args);
  };
  ```

  Keep `createController` unchanged.

- [ ] **Step 4: Run helper tests**

  Run:

  ```bash
  pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test -- core.spec.ts
  ```

  Expected: new helper overlay tests pass.

- [ ] **Step 5: Commit runtime helper**

  ```bash
  git add packages/vite-plugin-titanium-alloy/src/core.ts packages/vite-plugin-titanium-alloy/src/core.spec.ts
  git commit -m "feat(alloy): add async controller import helpers"
  ```

## Task 2: Add Controller Usage Scanner

**Files:**
- Modify: `packages/vite-codemod/src/index.ts`
- Create: `packages/vite-codemod/transforms/classify-alloy-controllers.cjs`
- Test: `packages/vite-codemod/transforms/classify-alloy-controllers.spec.mjs`

- [ ] **Step 1: Register the transform**

  In `packages/vite-codemod/src/index.ts`, add:

  ```ts
  export const transformNames = [
    "classify-alloy-controllers",
    "migrate-cjs-exports",
    "migrate-cjs-requires",
    "migrate-widget-wpath-requires",
  ] as const;
  ```

- [ ] **Step 2: Write classification tests**

  Create `packages/vite-codemod/transforms/classify-alloy-controllers.spec.mjs` with tests that run the transform through `jscodeshift` test utilities and assert category comments/output for:

  ```js
  const header = Alloy.createController('/misc/header').getView();
  ```

  Expected category: `sync-composition-likely`.

  ```js
  function onClick() {
    Alloy.createController('/trip/join', args).open();
  }
  ```

  Expected category: `runtime-boundary-candidate`.

  ```js
  this.currentDialog = Alloy.createController('/misc/dialog', args);
  ```

  Expected category: `stateful-ambiguous`.

  ```js
  return Alloy.createController('/trip/item', args);
  ```

  Expected category: `manual-review`.

- [ ] **Step 3: Run scanner tests to verify failure**

  Run:

  ```bash
  pnpm --filter @titanium-sdk/vite-codemod test -- classify-alloy-controllers.spec.mjs
  ```

  Expected: fail because the transform does not exist.

- [ ] **Step 4: Implement scanner categories**

  Create `packages/vite-codemod/transforms/classify-alloy-controllers.cjs`. Use jscodeshift to find `Alloy.createController(...)` and `Widget.createController(...)`. Classify from local syntax only:

  ```js
  const VIEW_METHODS = new Set(['getView', 'getViewEx']);
  const VIEW_PROPERTY_NAMES = new Set(['view', 'headerView', 'footerView', 'contentView', 'image']);

  function classify(path) {
    const parent = path.parent.node;
    if (isTopLevel(path)) return 'sync-composition-likely';
    if (isImmediateMethod(path, VIEW_METHODS)) return 'sync-composition-likely';
    if (isObjectPropertyNamed(path, VIEW_PROPERTY_NAMES)) return 'sync-composition-likely';
    if (isImmediateMethod(path)) return 'runtime-boundary-candidate';
    if (parent.type === 'VariableDeclarator' || parent.type === 'AssignmentExpression') return 'stateful-ambiguous';
    return 'manual-review';
  }
  ```

  For `--check`, print one line per call:

  ```text
  app/controllers/index.js:245 runtime-boundary-candidate Alloy.createController('/auth/passwordReset')
  ```

  Do not hard-code `.open()`, `.show()`, or `.openModally()` as universal navigation semantics. They are method-chain evidence only.

- [ ] **Step 5: Run scanner tests**

  Run:

  ```bash
  pnpm --filter @titanium-sdk/vite-codemod test -- classify-alloy-controllers.spec.mjs
  ```

  Expected: tests pass.

- [ ] **Step 6: Commit scanner**

  ```bash
  git add packages/vite-codemod/src/index.ts packages/vite-codemod/transforms/classify-alloy-controllers.cjs packages/vite-codemod/transforms/classify-alloy-controllers.spec.mjs
  git commit -m "feat(codemod): classify Alloy controller factories"
  ```

## Task 3: Add LLM-Guided Migration Prompt

**Files:**
- Create: `docs/ai-prompts/alloy-controller-boundary-migration.md`
- Modify: `packages/vite-codemod/README.md`
- Modify: `docs/alloy-esm-migration-notes.md`

- [ ] **Step 1: Create prompt directory**

  Run:

  ```bash
  mkdir -p docs/ai-prompts
  ```

- [ ] **Step 2: Write the migration prompt**

  Create `docs/ai-prompts/alloy-controller-boundary-migration.md` with:

  ```md
  # Alloy Controller Boundary Migration Assistant

  **Role:** You are a precise, changeset-oriented migration assistant for Titanium Alloy apps moving to Titanium Vite serve/build mode. Your job is to preserve sync UI composition while introducing async controller loading only at runtime/navigation boundaries.

  ## Ground Rules

  - Do not replace every `Alloy.createController()` call.
  - Treat `Alloy.createController()` and `Widget.createController()` as sync composition APIs.
  - Treat `Alloy.importController()` and `Widget.importController()` as async runtime/navigation APIs.
  - Do not make Alloy controller lifecycle APIs async.
  - Do not make `getView()`, `getViewEx()`, `addTopLevelView()`, or `updateViews()` async.
  - Preserve calls used for `headerView`, `footerView`, `contentView`, list rows/items, widget children, image generation, and synchronous helper return values.
  - Migrate calls that open or prepare a separate screen/flow after user action, deep link, push route, URL route, login callback, or feature-gate branch.
  - Work in small commits and explain every ambiguous decision.

  ## 0. Detect Context

  1. Run the scanner:
     `npx @titanium-sdk/vite-codemod classify-alloy-controllers app --check`
  2. Summarize category counts.
  3. Inspect project conventions for navigation method names. Do not assume `.open()` or `.show()` are universal; confirm from the app.

  ## 1. Preserve Sync Composition

  Keep `createController` when the result is used synchronously for:
  - `.getView()` or `.getViewEx()`
  - `headerView`, `footerView`, `contentView`, `view`, `image`
  - list rows/items/sections
  - top-level controller setup
  - widget-local child composition
  - `.toImage()`
  - functions that synchronously return Titanium views

  ## 2. Migrate Runtime Boundaries

  Convert confirmed navigation/runtime boundaries:

  ```js
  Alloy.createController('/trip/join', args).open();
  ```

  to:

  ```js
  const tripJoin = await Alloy.importController('/trip/join', args);
  tripJoin.open();
  ```

  Mark the containing callback/function `async` only when awaiting does not change caller return semantics.

  ## 3. Ambiguous Assignments

  For assignments such as:

  ```js
  this.currentView = Alloy.createController('/x', args);
  ```

  inspect subsequent usage before editing. Keep static composition if the value is used as sync UI state. Migrate only if it clearly represents a later screen boundary.

  ## 4. Verification

  - Run the scanner after migration and compare category counts.
  - Build Titanium Vite packages.
  - Validate Lambus in `ti build -p ios`.
  - Validate Lambus in `ti serve ios`.
  - Capture startup logs and a simulator screenshot.
  - Compare migrated output against the existing `vite-build` branch for unexpected behavioral divergence.
  ```

- [ ] **Step 3: Document the prompt and scanner**

  Add to `packages/vite-codemod/README.md`:

  ```md
  ### classify-alloy-controllers

  Scans `Alloy.createController()` and `Widget.createController()` usage and reports syntax-based categories. It does not infer app-specific navigation intent. Use `docs/ai-prompts/alloy-controller-boundary-migration.md` for LLM-guided migration.
  ```

- [ ] **Step 4: Update Alloy migration notes**

  In `docs/alloy-esm-migration-notes.md`, document:

  ```md
  - `Alloy.createController()` remains the sync composition API and may be statically imported.
  - `Alloy.importController()` is the async runtime/navigation API for route-level loading.
  - Use the controller boundary prompt for intent-sensitive app migrations.
  ```

- [ ] **Step 5: Commit prompt docs**

  ```bash
  git add docs/ai-prompts/alloy-controller-boundary-migration.md packages/vite-codemod/README.md docs/alloy-esm-migration-notes.md
  git commit -m "docs: add Alloy controller boundary migration prompt"
  ```

## Task 4: Trial Migration Against Lambus Main

**Files:**
- Create temporary worktree outside the active Lambus checkout.
- Do not mutate `/Users/janvennemann/Development/Lambus/lambus-titanium` until the trial is understood.

- [ ] **Step 1: Create a clean Lambus main worktree**

  Run from `/Users/janvennemann/Development/Lambus/lambus-titanium`:

  ```bash
  git fetch origin main vite-build
  git worktree add /private/tmp/lambus-main-controller-boundary origin/main
  ```

  Expected: a clean throwaway checkout at `/private/tmp/lambus-main-controller-boundary`.

- [ ] **Step 2: Run scanner on Lambus main**

  From `/Users/janvennemann/Development/Lambus/titanium-vite`, run:

  ```bash
  pnpm --filter @titanium-sdk/vite-codemod build
  node packages/vite-codemod/dist/cli.js classify-alloy-controllers /private/tmp/lambus-main-controller-boundary/app --check > /private/tmp/lambus-main-controller-boundary-scan.txt
  ```

  Expected: report contains category counts and per-call entries.

- [ ] **Step 3: Run scanner on current vite-build**

  From `/Users/janvennemann/Development/Lambus/titanium-vite`, run:

  ```bash
  node packages/vite-codemod/dist/cli.js classify-alloy-controllers /Users/janvennemann/Development/Lambus/lambus-titanium/app --check > /private/tmp/lambus-vite-build-controller-boundary-scan.txt
  ```

  Expected: report generated for current `vite-build` checkout.

- [ ] **Step 4: Compare scanner reports**

  Run:

  ```bash
  diff -u /private/tmp/lambus-main-controller-boundary-scan.txt /private/tmp/lambus-vite-build-controller-boundary-scan.txt > /private/tmp/lambus-controller-boundary-scan.diff || true
  ```

  Expected: diff identifies already-migrated areas and remaining category deltas.

- [ ] **Step 5: Apply LLM-guided migration to the main worktree**

  Use `docs/ai-prompts/alloy-controller-boundary-migration.md` as the agent prompt. Work through scanner candidates in small batches:

  ```bash
  node packages/vite-codemod/dist/cli.js classify-alloy-controllers /private/tmp/lambus-main-controller-boundary/app --check
  ```

  For each batch:
  - keep sync composition calls as `createController`;
  - migrate confirmed runtime/navigation calls to `await Alloy.importController`;
  - mark containing functions `async` only after checking caller return semantics;
  - commit the batch in the temporary Lambus worktree.

- [ ] **Step 6: Compare migrated main to vite-build**

  Run:

  ```bash
  git -C /private/tmp/lambus-main-controller-boundary diff --stat origin/main
  git -C /private/tmp/lambus-main-controller-boundary diff --name-only origin/main > /private/tmp/lambus-main-controller-boundary-changed-files.txt
  git -C /Users/janvennemann/Development/Lambus/lambus-titanium diff --name-only origin/main...HEAD > /private/tmp/lambus-vite-build-changed-files.txt
  diff -u /private/tmp/lambus-vite-build-changed-files.txt /private/tmp/lambus-main-controller-boundary-changed-files.txt > /private/tmp/lambus-controller-boundary-file-diff.txt || true
  ```

  Expected: file-level differences are explainable. Unexpected mismatches become review items before touching the real `vite-build` branch.

## Task 5: Verification Pass

**Files:**
- Modify only after trial: real Lambus `vite-build` branch if the trial succeeds.

- [ ] **Step 1: Build Titanium Vite packages**

  Run:

  ```bash
  pnpm build
  pnpm --filter @titanium-sdk/vite-codemod test
  pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test
  ```

  Expected: all commands exit 0.

- [ ] **Step 2: Validate Lambus normal mode**

  From the migrated Lambus checkout, run elevated:

  ```bash
  ti build -p ios
  ```

  Expected: app launches without controller loading errors. Capture startup logs.

- [ ] **Step 3: Validate Lambus serve mode**

  If port `8323` is blocked, identify and kill the old listener:

  ```bash
  lsof -nP -iTCP:8323 -sTCP:LISTEN
  kill <pid>
  ```

  Then run elevated:

  ```bash
  ti serve ios
  ```

  Expected: app reaches a visible first screen. Startup logs should not show the previous runaway recursive controller fetch pattern.

- [ ] **Step 4: Capture simulator screenshot**

  Run:

  ```bash
  xcrun simctl io booted screenshot /private/tmp/lambus-controller-boundary-serve.png
  ```

  Expected: screenshot shows a visible app screen, not a blank white screen.

- [ ] **Step 5: Record verification summary**

  Add a short note to the PR or working summary:

  ```md
  Verification:
  - pnpm build: pass
  - vite-codemod tests: pass
  - alloy plugin tests: pass
  - ti build -p ios: pass/fail with log path
  - ti serve ios: pass/fail with log path
  - simulator screenshot: /private/tmp/lambus-controller-boundary-serve.png
  - controller scanner report before/after: attached or linked
  ```

## Task 6: Cleanup Temporary Worktree

**Files:**
- Temporary worktree: `/private/tmp/lambus-main-controller-boundary`

- [ ] **Step 1: Preserve trial artifacts**

  Copy scanner reports and diffs into `/private/tmp`:

  ```bash
  ls -l /private/tmp/lambus-*-controller-boundary-*.txt /private/tmp/lambus-controller-boundary-serve.png
  ```

  Expected: reports and screenshot exist.

- [ ] **Step 2: Remove the temporary worktree**

  Run from `/Users/janvennemann/Development/Lambus/lambus-titanium`:

  ```bash
  git worktree remove /private/tmp/lambus-main-controller-boundary
  ```

  Expected: temporary worktree removed without touching the active `vite-build` checkout.

## Self-Review

- Spec coverage: runtime helper, sync boundary, scanner, LLM prompt, Lambus main trial, comparison with `vite-build`, and normal/serve verification are covered.
- Placeholder scan: no `TBD`, `TODO`, or undefined task dependencies.
- Type consistency: helper names are consistently `Alloy.importController()` and `Widget.importController()`; scanner transform name is consistently `classify-alloy-controllers`.
