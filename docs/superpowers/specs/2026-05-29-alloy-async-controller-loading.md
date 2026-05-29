# Alloy Async Controller Loading

## Problem

Titanium Vite Alloy serve mode currently fails for Lambus-scale apps because
authored `Alloy.createController(...)` and `Widget.createController(...)` calls
are compiled into top-level static ESM imports. Importing the index controller
therefore pulls in the recursive controller graph before the app can open its
first useful window.

The observed Lambus serve run triggered 4714 `fetchModule` calls and 217
distinct `/app/controllers/...` modules while the simulator stayed on a blank
screen. This is a correctness failure, not only a startup performance issue.

Static ESM loading is still the right model for synchronous composition. The
problem is that authored runtime/navigation controller factories are currently
indistinguishable from composition factories, so route-level screens can be
pulled into the initial graph.

## Goals

- Make Alloy serve mode work for Lambus-scale apps without recursively loading
  every controller reachable from `index`.
- Preserve static ESM imports for XML-generated controller/widget structure.
- Provide an explicit async API for runtime controller creation.
- Provide a mechanical migration path for app code.
- Make runtime/navigation controller loading explicit enough to create a natural
  route-level code-splitting boundary.

## Non-Goals

- Do not redesign Alloy's full runtime loading model.
- Do not add async model, collection, or widget factory APIs in this slice.
- Do not preserve transparent sync lazy controller loading over Vite's dev
  server.
- Do not move the helper into the upstream `alloy` package until the Vite
  integration shape has proven stable.

## Runtime Helper

The Vite Alloy integration will augment the Alloy runtime object with async
controller helpers:

```js
const controller = await Alloy.importController('/trip/join', args);
const child = await Widget.importController('calendarItem', args);
```

`Alloy.importController(name, args)` will:

- accept names with or without a leading slash;
- normalize the name to `/alloy/controllers/<name>`;
- load the controller module through the Vite-aware loader for the current mode;
- unwrap `module.default ?? module`;
- instantiate the controller with `args`;
- return the controller instance.

`Widget.importController(name, args)` will:

- resolve relative to the current widget id;
- normalize the name to `/alloy/widgets/<widgetId>/controllers/<name>`;
- use the same dynamic import, unwrap, instantiate, and return behavior.

The helper will be installed by the Vite plugin overlay first. It is not an
upstream Alloy runtime API commitment yet.

The overlay must cover both runtime locations:

- the main `/alloy` runtime object for `Alloy.importController(...)`;
- the `/alloy/widget` runtime so each widget object receives
  `Widget.importController(...)`.

Serve mode should use dynamic `import()` so Vite's ModuleRunner fetches only the
requested controller. Production builds should not rely on unbounded variable
dynamic imports being statically bundled. The production helper can return a
promise around the existing runtime `require('/alloy/controllers/' + name)` path,
because production already emits enumerated Alloy runtime entries at those
Titanium module paths.

## Sync Boundary

The async boundary belongs before runtime controller construction, not inside the
Alloy controller lifecycle.

XML-generated child controllers and widgets are part of parent controller
construction. They are declared in Alloy XML through nodes such as static
`<Require>` and `<Widget>`, then compiled into parent-constructor UI assembly
code. That generated code may immediately call child APIs such as `getViewEx()`
or insert the child view into a parent `Tab`, `Window`, or `View`. Those
dependencies must remain synchronously available, so static ESM imports are the
right model for XML-generated structure.

Authored runtime controller creation is different when it opens or prepares a
separate screen later. Calls in handwritten JavaScript control flow, such as
event handlers, deep-link handlers, login callbacks, and navigation helpers, are
the target of this async migration.

Alloy controller instances remain normal synchronous controller instances after
they have been imported and constructed. APIs such as `getView()`, `getViewEx()`,
`addTopLevelView()`, and `updateViews()` should not become async.

`Alloy.createController()` and `Widget.createController()` remain the sync
composition APIs. They mean: this controller belongs to the current UI/component
graph and may be statically imported. `Alloy.importController()` and
`Widget.importController()` are the async runtime/navigation APIs. They mean:
this controller is a later route or flow boundary and should load lazily.

## Compiler And Plugin Behavior

The Alloy compiler may continue emitting static ESM imports for XML-generated
structure, including static `<Require>` and `<Widget>` dependencies. These are
part of controller construction and are expected to be synchronously available.

The authored controller factory transform in Alloy DevKit should keep hoisting
literal `Alloy.createController(...)` and `Widget.createController(...)` calls
into static imports by default. That transform is correct for sync composition
paths, including top-level controller setup, view assembly, `headerView`,
`footerView`, `contentView`, list rows, widget children, and image generation.

The Vite Alloy plugin should not blanket-reject `createController`. Diagnostics
may flag likely runtime/navigation candidates that still use sync
`createController`, but those diagnostics should start as a migration aid rather
than a hard generic error. Project-specific migration guidance decides which
calls become `importController`.

## Codemod

Extend `@titanium-sdk/vite-codemod` with a controller scanner command, for
example:

```bash
npx @titanium-sdk/vite-codemod classify-alloy-controllers path/to/app --check
```

The tool should classify call sites by local syntax and only rewrite
mechanically safe cases if a future write mode is added. It cannot reliably
infer navigation intent across all apps. Its generic output should use
evidence-based labels:

- `sync-composition-likely`: `.getView()`, `.getViewEx()`, view-like object
  properties, top-level setup, and widget child composition.
- `runtime-boundary-candidate`: immediate non-view method chains and
  callback-shaped contexts.
- `stateful-ambiguous`: assignments to variables/properties that may be cached
  controller state or later navigation.
- `manual-review`: return values, complex expressions, dynamic names, and any
  call where preserving behavior requires project intent.

Project-specific LLM guidance may map app conventions such as `.open()`,
`.show()`, or `.openModally()` to runtime/navigation boundaries. The generic
codemod should not hard-code those method names as universal semantics.

Simple assignments:

```js
const dialog = Alloy.createController('/misc/dialog', args);
```

become:

```js
const dialog = await Alloy.importController('/misc/dialog', args);
```

Simple method chains:

```js
Alloy.createController('/trip/join', args).open();
```

become:

```js
const tripJoin = await Alloy.importController('/trip/join', args);
tripJoin.open();
```

Widget-local controller creation follows the same pattern with
`Widget.importController(...)`.

The codemod may mark containing functions or callbacks `async` when that change
is mechanically safe and the call has been classified as a runtime boundary. It
must report hard sync expression contexts instead of inventing fragile control
flow.

Because this migration depends on call-site intent, provide an LLM-guided upgrade
prompt similar in spirit to Prisma's AI migration prompts. The prompt should tell
an agent how to use scanner output, preserve sync composition, migrate
runtime/navigation boundaries, work in small reviewable changes, and verify the
result against the app.

## Error Handling

Runtime helper errors should preserve the original dynamic import or controller
construction failure. The helper may add controller-name context, but it should
not swallow or convert the failure into a generic error.

Compile-time diagnostics should name the unsupported factory call and recommend
the exact async helper. They should also mention the codemod command once that
command exists.

## Testing

Add focused tests for:

- `Alloy.importController()` name normalization, ESM default unwrapping, and
  controller instantiation.
- `Widget.importController()` widget-relative resolution and instantiation.
- Scanner classification for sync composition, runtime-boundary candidates,
  stateful ambiguous calls, and manual-review contexts.
- The scanner not treating project-specific method names as universal
  navigation semantics.
- XML-generated static controller/widget imports still compiling as static ESM.
- The codemod rewriting only high-confidence runtime-boundary cases.
- The codemod `--check` mode reporting category counts and manual-review sites.

Validation against Lambus must include serve mode with simulator logs and a
screenshot of the first visible app state. The old failure signature is thousands
of controller fetches before the first window; that should disappear for migrated
runtime call sites.

## Rollout

1. Add the Vite-scoped async controller helper overlay.
2. Preserve static hoisting for sync composition calls.
3. Add the scanner/codemod classification and check mode.
4. Add the LLM-guided upgrade prompt.
5. Trial the migration on a temporary Lambus `main` checkout and compare the
   result to the existing `vite-build` branch.
6. Validate Lambus in normal build/run and serve mode.
7. Update `docs/alloy-esm-migration-notes.md` with the async controller loading
   contract.

## Open Questions

None. The initial scope is app and widget controller factories only, with helper
implementation in the Vite plugin overlay, classification support in
`@titanium-sdk/vite-codemod`, and LLM-guided migration for intent-sensitive call
sites.
