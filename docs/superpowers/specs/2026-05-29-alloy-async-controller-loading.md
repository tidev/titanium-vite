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

Static ESM loading is still the right model for XML-generated structure. The
problem is applying that model to authored runtime controller factories, where
the old Alloy API looks lazy but the ESM transform makes it eager.

## Goals

- Make Alloy serve mode work for Lambus-scale apps without recursively loading
  every controller reachable from `index`.
- Preserve static ESM imports for XML-generated controller/widget structure.
- Provide an explicit async API for runtime controller creation.
- Provide a mechanical migration path for app code.
- Fail remaining sync runtime controller factory calls clearly before they can
  create a recursive serve-mode module graph.

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

## Compiler And Plugin Behavior

The Alloy compiler may continue emitting static ESM imports for XML-generated
structure, including static `<Require>` and `<Widget>` dependencies. These are
part of controller construction and are expected to be synchronously available.

The authored controller factory transform in Alloy DevKit must stop hoisting
these calls into top-level imports:

```js
Alloy.createController(...);
Widget.createController(...);
```

The Vite Alloy plugin will provide the primary fail-fast source check for
app-owned JavaScript. It must run on source before the static-hoist transform can
turn authored runtime calls into eager imports. It must cover controller source
and broader app modules such as `app/lib/**`, because Lambus creates controllers
outside Alloy-compiled controller files too.

When the source check finds an authored sync controller factory call in ESM mode,
it should report a migration-oriented diagnostic that points to:

```js
await Alloy.importController(name, args);
await Widget.importController(name, args);
```

The check should only target controller factories in this slice:

- `Alloy.createController(...)`
- `Widget.createController(...)`

It should not block `createWidget`, `createModel`, or `createCollection` until
those APIs have a separate usage audit and migration design.

## Codemod

Extend `@titanium-sdk/vite-codemod` with a controller migration command, for
example:

```bash
npx @titanium-sdk/vite-codemod migrate-alloy-create-controller path/to/app
npx @titanium-sdk/vite-codemod migrate-alloy-create-controller path/to/app --check
```

The codemod should rewrite mechanically safe cases from sync factory calls to
async helper calls.

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
is mechanically safe. It must report hard sync expression contexts instead of
inventing fragile control flow.

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
- The Vite Alloy source check rejecting authored `Alloy.createController(...)`
  in controller source.
- The source check rejecting authored `Alloy.createController(...)` in app lib
  source.
- The source check rejecting authored `Widget.createController(...)` in widget
  controller source.
- XML-generated static controller/widget imports still compiling as static ESM.
- The codemod rewriting simple assignments and method chains.
- The codemod `--check` mode reporting unsafe sync expression contexts.

Validation against Lambus must include serve mode with simulator logs and a
screenshot of the first visible app state. The old failure signature is thousands
of controller fetches before the first window; that should disappear for migrated
runtime call sites.

## Rollout

1. Add the Vite-scoped async controller helper overlay.
2. Disable authored controller factory static hoisting so it cannot create the
   recursive graph. XML-generated static imports remain enabled.
3. Add the Vite Alloy source check for sync controller factories.
4. Add the codemod and check mode.
5. Migrate Lambus call sites mechanically.
6. Validate Lambus in normal build/run and serve mode.
7. Update `docs/alloy-esm-migration-notes.md` with the async controller loading
   contract.

## Open Questions

None. The initial scope is app and widget controller factories only, with helper
implementation in the Vite plugin overlay and codemod support in
`@titanium-sdk/vite-codemod`.
