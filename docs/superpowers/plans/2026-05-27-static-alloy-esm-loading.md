# Static Alloy ESM Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale app-owned Alloy dev preloads with a real ESM dependency graph across Titanium Vite and alloy-devkit.

**Architecture:** Titanium Vite owns execution: dev preloads, entry bootstrap, Vite resolution, dev/build parity, and dynamic import behavior. alloy-devkit owns generated code: ESM controller/model templates and XML-generated static dependencies. Authored dynamic names remain explicit user code or become migration diagnostics.

**Tech Stack:** TypeScript, Vite custom environment, Vitest, Titanium CLI, alloy-devkit compiler templates/parsers, JavaScript ESM.

---

## File Structure

- `packages/vite-plugin-titanium-alloy/src/index.ts`: define dev preload policy; fixed runtime preloads only.
- `packages/vite-plugin-titanium-alloy/src/entry.ts`: bootstrap the app through a static `index` controller import.
- `packages/vite-plugin-titanium-alloy/src/index.spec.ts`: assert preload contract.
- `packages/vite-plugin-titanium/src/index.spec.ts`: assert transformed dev entry and dynamic import behavior.
- `docs/alloy-esm-migration-notes.md`: document user-facing ESM loading contract and known migration requirements.
- `apps/titanium-vite-alloy/app/controllers/index.js`: keep only sample-app code that represents supported user patterns; remove spike-only logging when productionized.
- `apps/titanium-vite-alloy/app/controllers/dynamic/hello.js`: either keep as a deliberate dynamic import fixture or move this scenario into a dedicated test fixture.
- `../alloy-devkit/packages/alloy-compiler/template/component.es6.js`: replace generated BaseController `require()` with a static ESM import.
- `../alloy-devkit/packages/alloy-compiler/template/model.es6.js`: likely unchanged except tests; already exports `Model` and `Collection`.
- `../alloy-devkit/packages/alloy-compiler/lib/parsers/Alloy.Require.js`: in ESM mode, emit generated imports and constructor calls for static XML `<Require>`.
- `../alloy-devkit/packages/alloy-compiler/lib/parsers/Alloy.Abstract._BackboneClass.js`: in ESM mode, emit generated imports and direct model/collection construction for XML `<Model>` and `<Collection>`.
- `../alloy-devkit/packages/alloy-compiler/lib/compilerUtils.js`: add or reuse compiler-level generated import collection/deduplication.
- `../alloy-devkit/packages/alloy-compiler/test/unit/esm.spec.js`: assert generated ESM code has static imports and no generated runtime name lookup for static dependencies.

## Task 1: Turn Spike Into Titanium Vite Contract

**Files:**
- Modify: `packages/vite-plugin-titanium-alloy/src/index.ts`
- Modify: `packages/vite-plugin-titanium-alloy/src/entry.ts`
- Modify: `packages/vite-plugin-titanium-alloy/src/index.spec.ts`
- Modify: `packages/vite-plugin-titanium/src/index.spec.ts`
- Modify: `docs/alloy-esm-migration-notes.md`

- [x] **Step 1: Keep the failing/preventing tests**

  Preserve tests that assert:

  ```ts
  expect(preloads).toEqual(
    expect.arrayContaining([
      "/alloy",
      "/alloy/CFG",
      "/alloy/backbone",
      "/alloy/controllers/BaseController",
      "/alloy/underscore",
      "/alloy/sync/properties",
    ]),
  );
  expect(preloads).not.toContain("/alloy/controllers/index");
  expect(preloads).not.toContain("/alloy/models/Book");
  ```

  Preserve the dev entry assertion:

  ```ts
  expect(result.code).toContain("/app/controllers/index.js");
  expect(result.code).toContain("new __vite_ssr_import_");
  expect(result.code).not.toContain("Alloy.createController('index')");
  ```

- [x] **Step 2: Make the preload policy explicit**

  In `packages/vite-plugin-titanium-alloy/src/index.ts`, keep `createDevModulePreloads()` limited to fixed runtime modules plus sync adapters:

  ```ts
  function createDevModulePreloads(entries: CollectedEntries): string[] {
    const chunkNames = Object.keys(entries.byChunk);
    const syncChunks = chunkNames.filter(isAlloySyncChunk);

    return [
      ...ALLOY_DEV_RUNTIME_PRELOADS,
      ...syncChunks.map((chunkName) => `/${chunkName}`),
    ];
  }
  ```

- [x] **Step 3: Bootstrap `index` statically**

  In `packages/vite-plugin-titanium-alloy/src/entry.ts`, keep the app entry transform in this shape:

  ```ts
  return `import Alloy from '/alloy';
  import IndexController from '/alloy/controllers/index';

  // Always define globals to make sure they are the correct ones loaded via LiveView
  global.Alloy = Alloy;
  global.Backbone = Alloy.Backbone;

  ${code}

  Ti.UI.addEventListener('sessionbegin', function () {
  	new IndexController();
  });

  if ((typeof Ti.UI.hasSession === 'undefined') || Ti.UI.hasSession) {
  	new IndexController();
  }`;
  ```

- [x] **Step 4: Document the new contract**

  Add a concise section to `docs/alloy-esm-migration-notes.md`:

  ```md
  ## Static Loading Contract

  - Titanium Vite dev mode preloads only shared Alloy runtime modules and sync adapters.
  - App-owned controllers, models, collections, and widgets must enter the graph through ESM imports.
  - The app entry imports `/alloy/controllers/index` directly and instantiates it.
  - Static XML-generated dependencies should be emitted by alloy-devkit as ESM imports.
  - Dynamic controller/model names remain user-authored dynamic imports or migration errors until a transform explicitly supports them.
  ```

- [x] **Step 5: Verify Titanium Vite package tests**

  Run:

  ```bash
  pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test
  pnpm --filter @titanium-sdk/vite-plugin-titanium test
  pnpm typecheck
  ```

  Expected: all commands exit 0.

## Task 2: Decide Sample App Versus Test Fixture for Dynamic Imports

**Files:**
- Modify: `apps/titanium-vite-alloy/app/controllers/index.js`
- Keep or remove: `apps/titanium-vite-alloy/app/controllers/dynamic/hello.js`
- Keep or remove: `apps/titanium-vite-alloy/app/views/dynamic/hello.xml`
- Modify: `packages/vite-plugin-titanium/src/index.spec.ts`

- [x] **Step 1: Keep the dynamic import behavior test**

  Keep transform coverage that proves both literal and Vite-supported variable imports stay on Vite's module path:

  ```ts
  expect(result.code).toContain(
    '__vite_ssr_dynamic_import__("/app/controllers/dynamic/hello.js")',
  );
  expect(result.code).toContain('"./dynamic/hello.js"');
  expect(result.code).toContain("`./dynamic/${dynamicControllerName}.js`");
  expect(result.code).not.toContain('require("./dynamic/hello.js")');
  ```

- [x] **Step 2: Remove spike-only logging from the user-facing sample**

  If `hello.js` remains in the sample app, keep the code as a deliberate example of supported dynamic import shape. If it moves to a fixture, restore `apps/titanium-vite-alloy/app/controllers/index.js` to normal sample-app behavior and place the dynamic import controller under a test fixture.

- [x] **Step 3: Preserve production interop in the example or test**

  Any dynamic import example that instantiates an Alloy controller must handle dev ESM namespace and production CJS module return:

  ```js
  const controllerModule = await import("./dynamic/hello.js");
  const Controller = controllerModule.default ?? controllerModule;
  const controller = new Controller();
  ```

- [x] **Step 4: Verify dev and production manually**

  In `apps/titanium-vite-alloy`, run elevated:

  ```bash
  ti clean
  ti serve ios
  ```

  Expected: app starts without `Requested module not found`.

  Then run elevated:

  ```bash
  ti build -p ios
  ```

  Expected: production app starts without static or dynamic import errors.

## Task 3: Add alloy-devkit Generated Import Infrastructure

**Files:**
- Modify: `../alloy-devkit/packages/alloy-compiler/lib/compilerUtils.js`
- Modify: `../alloy-devkit/packages/alloy-compiler/template/component.es6.js`
- Modify: `../alloy-devkit/packages/alloy-compiler/test/unit/esm.spec.js`

- [x] **Step 1: Add generated import collection**

  Add a small compiler utility API for ESM-only generated imports. The exact implementation should dedupe by module specifier and imported binding. A representative shape:

  ```js
  exports.generatedImports = [];

  exports.addGeneratedImport = function (specifier, binding) {
  	var existing = exports.generatedImports.find(function (entry) {
  		return entry.specifier === specifier && entry.binding === binding;
  	});
  	if (!existing) {
  		exports.generatedImports.push({
  			specifier: specifier,
  			binding: binding
  		});
  	}
  };

  exports.renderGeneratedImports = function () {
  	return exports.generatedImports.map(function (entry) {
  		return 'import ' + entry.binding + ' from \'' + entry.specifier + '\';';
  	}).join('\n');
  };
  ```

- [x] **Step 2: Reset generated imports per component compile**

  Ensure `generatedImports` is reset before compiling each component so imports cannot leak across controllers. The reset belongs next to existing per-component compiler state initialization.

- [x] **Step 3: Render generated imports in `component.es6.js`**

  Add an ESM import slot near the top of the component template:

  ```js
  import Alloy from '/alloy';
  import BaseController from '/alloy/controllers/BaseController';

  <%= generatedImports %>
  ```

  Replace the constructor-local BaseController `require()` block with:

  ```js
  BaseController.apply(this, Array.prototype.slice.call(arguments));
  ```

- [x] **Step 4: Assert BaseController is static**

  In `esm.spec.js`, assert generated ESM controller code contains:

  ```js
  expect(result.code).toContain("import BaseController from '/alloy/controllers/BaseController';");
  expect(result.code).not.toContain("require('/alloy/controllers/' + 'BaseController')");
  ```

- [x] **Step 5: Run alloy-devkit ESM tests**

  In `../alloy-devkit`, run:

  ```bash
  pnpm --filter alloy-compiler test -- esm.spec.js
  ```

  Expected: ESM compiler tests exit 0.

## Task 4: Move XML `<Require>` Static Dependencies Into alloy-devkit ESM Output

**Files:**
- Modify: `../alloy-devkit/packages/alloy-compiler/lib/parsers/Alloy.Require.js`
- Modify: `../alloy-devkit/packages/alloy-compiler/test/unit/esm.spec.js`

- [x] **Step 1: Add failing ESM `<Require>` test**

  Add an ESM fixture/test that compiles a controller view containing:

  ```xml
  <Alloy>
  	<Window>
  		<Require src="child" id="child" />
  	</Window>
  </Alloy>
  ```

  Assert the generated code contains a static import and constructor usage:

  ```js
  expect(result.code).toContain("import ChildController from '/alloy/controllers/child';");
  expect(result.code).toContain("new ChildController(");
  expect(result.code).not.toContain("Alloy.createController('child'");
  ```

- [x] **Step 2: Emit ESM require code only in ESM mode**

  In `Alloy.Require.js`, branch on compiler metadata/config ESM mode. For ESM mode, register:

  ```js
  CU.addGeneratedImport('/alloy/controllers/' + src, controllerImportName);
  ```

  Generate:

  ```js
  code += (state.local ? 'var ' : '') + args.symbol + ' = new ' + controllerImportName + '(' + styleParams + ');\n';
  ```

  Keep the existing `Alloy.createController()` path for non-ESM mode.

- [x] **Step 3: Preserve parent/view behavior**

  Preserve existing behavior after instantiation:

  ```js
  let parent = {
  	symbol: args.symbol + '.getViewEx({recurse:true})'
  };
  if (args.parent.symbol && !state.templateObject && !state.androidMenu) {
  	code += args.symbol + '.setParent(' + args.parent.symbol + ');\n';
  }
  ```

- [x] **Step 4: Run alloy-devkit tests**

  In `../alloy-devkit`, run:

  ```bash
  pnpm --filter alloy-compiler test -- esm.spec.js
  ```

  Expected: ESM compiler tests exit 0.

## Task 5: Move XML Model and Collection Static Dependencies Into alloy-devkit ESM Output

**Files:**
- Modify: `../alloy-devkit/packages/alloy-compiler/lib/parsers/Alloy.Abstract._BackboneClass.js`
- Modify: `../alloy-devkit/packages/alloy-compiler/test/unit/esm.spec.js`

- [x] **Step 1: Add failing ESM model/collection XML test**

  Add an ESM fixture/test that compiles XML with static model and collection nodes:

  ```xml
  <Alloy>
  	<Model src="book" instance="true" id="book" />
  	<Collection src="book" instance="true" id="books" />
  	<Window />
  </Alloy>
  ```

  Assert generated code imports the model module and avoids runtime name lookup:

  ```js
  expect(result.code).toContain("from '/alloy/models/book';");
  expect(result.code).not.toContain("Alloy.createModel('book')");
  expect(result.code).not.toContain("Alloy.createCollection('book')");
  ```

- [x] **Step 2: Generate direct construction for ESM instance nodes**

  In ESM mode, register named imports from the model module:

  ```js
  CU.addGeneratedImport('/alloy/models/' + src, '{ Model as BookModel, Collection as BookCollection }');
  ```

  Generate direct instance code:

  ```js
  $.book = new BookModel();
  $.books = new BookCollection();
  ```

  Keep singleton behavior explicit and review whether singleton cache remains an Alloy runtime responsibility.

- [x] **Step 3: Keep non-ESM output unchanged**

  Preserve current generated code for CommonJS/non-ESM compiles:

  ```js
  Alloy.createModel('book')
  Alloy.createCollection('book')
  Alloy.Models.instance('book')
  Alloy.Collections.instance('book')
  ```

- [x] **Step 4: Run alloy-devkit tests**

  In `../alloy-devkit`, run:

  ```bash
  pnpm --filter alloy-compiler test -- esm.spec.js
  ```

  Expected: ESM compiler tests exit 0.

## Task 6: Wire alloy-devkit Changes Back Through Titanium Vite

**Files:**
- Modify package dependency or local linked package as required by current workspace setup.
- Modify: `docs/alloy-esm-migration-notes.md`

- [x] **Step 1: Verify linked alloy-devkit source**

  `titanium-vite` lockfiles already link `alloy-compiler` and `alloy-utils` to `../../../alloy-devkit/packages/...`, so no package bump is needed for local verification.

  In `../alloy-devkit`, run:

  ```bash
  pnpm --filter alloy-compiler test -- esm.spec.js
  ```

  Expected: compiler ESM tests exit 0.

- [x] **Step 2: Rebuild Titanium Vite packages**

  In `titanium-vite`, run:

  ```bash
  pnpm build
  ```

  Expected: all packages build successfully.

- [x] **Step 3: Run Titanium Vite tests**

  In `titanium-vite`, run:

  ```bash
  pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test
  pnpm --filter @titanium-sdk/vite-plugin-titanium test
  pnpm typecheck
  ```

  Expected: all commands exit 0.

- [x] **Step 4: Run manual app verification**

  In `apps/titanium-vite-alloy`, run elevated:

  ```bash
  ti clean
  ti serve ios
  ```

  Expected: dev app starts without stale preload errors.

  Then run elevated:

  ```bash
  ti build -p ios
  ```

  Expected: production app starts without static import, model import, or dynamic import errors.

## Task 7: Authored `Alloy.create*` Migration Ergonomics

**Files:**
- Modify or create Titanium Vite transform file if this phase stays in `titanium-vite`.
- Or modify `../alloy-devkit/packages/alloy-compiler/lib/ast/controller.js` if authored JS migration belongs in devkit.
- Modify: `docs/alloy-esm-migration-notes.md`

- [ ] **Step 1: Define supported authored patterns**

  Support or diagnose these patterns:

  ```js
  Alloy.createController("settings");
  Alloy.createModel("Book");
  Alloy.createCollection("Book");
  ```

  Do not promise support for this in the first implementation:

  ```js
  Alloy.createController(name);
  Alloy.createController(prefix + name);
  ```

- [ ] **Step 2: Choose transform owner**

  Prefer alloy-devkit if the transform happens while controller source is already being parsed/injected. Prefer Titanium Vite if the transform needs Vite resolver context or should apply only to Vite builds.

- [ ] **Step 3: Add diagnostics before broad rewrites**

  If transform support is not implemented immediately, add a clear compile-time diagnostic for unsupported app-owned runtime name lookups in Vite ESM mode:

  ```text
  Alloy.createController(name) is not statically loadable in Titanium Vite ESM mode. Use await import(`./path/${name}.js`) or a literal controller import.
  ```

- [ ] **Step 4: Document migration examples**

  Add examples to `docs/alloy-esm-migration-notes.md`:

  ```js
  import SettingsController from "/alloy/controllers/settings";

  const settings = new SettingsController(args);
  ```

  ```js
  const module = await import(`./dynamic/${name}.js`);
  const Controller = module.default ?? module;
  const controller = new Controller(args);
  ```

## Verification Summary

- `pnpm --filter @titanium-sdk/vite-plugin-titanium-alloy test`
- `pnpm --filter @titanium-sdk/vite-plugin-titanium test`
- `pnpm typecheck`
- In `../alloy-devkit`: `pnpm --filter alloy-compiler test -- esm.spec.js`
- In `../alloy-devkit`: `pnpm --filter alloy-compiler test -- esm.spec.js`
- In `apps/titanium-vite-alloy`, elevated: `ti clean`
- In `apps/titanium-vite-alloy`, elevated: `ti serve ios`
- In `apps/titanium-vite-alloy`, elevated: `ti build -p ios`

## Unresolved Questions

- Dynamic import example stays in app or fixture?
- Authored literal `Alloy.create*` transform owner?
- XML singleton model cache semantics under ESM?
