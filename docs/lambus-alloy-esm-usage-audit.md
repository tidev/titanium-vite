# Lambus Alloy ESM Usage Audit

Source app: `../lambus-titanium/app`

Audit date: 2026-05-27

Purpose: capture the Lambus usage patterns that matter for the static Alloy ESM loading work, especially widgets and dynamic controller creation.

## Summary

- Lambus uses widgets heavily, so widget ESM support is required before this path can be considered viable for real app migration.
- All `Alloy.createWidget(...)` calls found in source use literal widget IDs.
- XML `<Widget>` usage also uses literal widget IDs.
- Widget child-controller usage is literal.
- Dynamic controller names exist, but they are mostly finite app-specific choices rather than arbitrary user input.

## Widget Usage

- Widget source directories: 19
- `Alloy.createWidget(...)` calls: 151
- XML `<Widget ...>` nodes: 25
- `Widget.createController(...)` calls: 4

Widget IDs used by `Alloy.createWidget(...)`:

- `io.lambus.pageSheet`: 58
- `io.lambus.modalForm`: 22
- `io.lambus.googlePlacesAutocompletionDialog`: 16
- `io.lambus.fullscreenPhotoGallery`: 14
- `io.lambus.googlePlacesNearbyAutocompletionDialog`: 11
- `io.lambus.modalView`: 10
- `io.lambus.currencySelector`: 4
- `io.lambus.dateRangeDialog`: 4
- `io.lambus.googlePlacesAutocompletionTable`: 3
- `io.lambus.selectForm`: 3
- `io.lambus.modalUsernameForm`: 2
- `io.lambus.documentImporter`: 1
- `io.lambus.emptyState`: 1
- `io.lambus.splitSelectForm`: 1
- `io.lambus.videoChat`: 1

Note: `io.lambus.videoChat` is referenced from `app/lib/trip-details-action-manager-v3.js`, but no matching `app/widgets/io.lambus.videoChat` source directory was found in this checkout.

XML widget nodes:

- `io.lambus.emptyState`: 20
- `io.lambus.pieChart`: 2
- `io.lambus.lineChart`: 1
- `io.lambus.promptBanner`: 1
- `io.lambus.swipeableTabs`: 1

Widget child controllers:

- `io.lambus.pagination`: `Widget.createController('dot', ...)`
- `io.lambus.documentImporter`: `Widget.createController('directorySelect', ...)`
- `io.lambus.dateRangeDialog`: `Widget.createController('calendarItem', ...)`
- `io.lambus.fullscreenPhotoGallery`: `Widget.createController('photo', ...)`

Widget-local path usage:

- `app/widgets/io.lambus.emptyState/controllers/widget.js` uses `require(WPATH('button'))`.
- This points at `app/widgets/io.lambus.emptyState/lib/button.js`.

## Controller Creation

`Alloy.createController(...)` source calls:

- Total: 577
- Literal string calls: 565
- Literal template calls: 1
- Dynamic calls: 11

Dynamic examples:

- `app/controllers/index.js`: `viewToOpen`
- `app/controllers/index.js`: `InitialView.ProtectedArea`
- `app/controllers/discover/detail/index.js`: `` `/discover/detail/properties/${property.type}` ``
- `app/controllers/discover/list/index.js`: `` `/discover/list/${controller.type}` ``
- `app/controllers/trip/detail/transportation/addTransportationSheet/v2/index.js`: `` `/trip/detail/transportation/addTransportationSheet/v2/${type}/index` ``
- `app/controllers/trip/detail/transportation/v3/details/content.js`: `` `/trip/detail/transportation/v3/types/${transportViewModel.dataModel.type}/index` ``
- `app/controllers/trip/detail/transportation/v3/details/content.js`: `` `/trip/detail/transportation/v3/types/${TransportationTypesV3.FLIGHT}/lookupForm` ``
- `app/controllers/trip/detail/transportation/v3/index.js`: `getControllerPath()`
- `app/controllers/trip/list/index.js`: `` `/trip/detail/${tripDetailsVersion}/index` ``
- `app/lib/version-update-screen-manager.js`: `` `/misc/updateScreens/${identifier}` ``
- `app/widgets/io.lambus.swipeableTabs/controllers/widget.js`: `view.viewPath`

The `io.lambus.swipeableTabs` dynamic case is fed by three literal paths from `app/controllers/trip/detail/expenses/index.js`:

- `/trip/detail/expenses/ownExpenses`
- `/trip/detail/expenses/overview`
- `/trip/detail/expenses/billing`

## Model And Collection Creation

- `Alloy.createModel(...)`: 1 literal call, `user`, in `app/alloy.js`.
- `Alloy.createCollection(...)`: no source calls found.
- `Widget.createModel(...)`: no source calls found.
- `Widget.createCollection(...)`: no source calls found.

## XML Require Usage

- XML `<Require ...>` nodes: 108
- These are static source paths and should be handled by Alloy DevKit's ESM generated imports.
- Current Alloy DevKit already emits static ESM imports for `<Require type="view">` in ESM mode.
- XML widget requires still need ESM support because `<Widget>` is rewritten to `<Require type="widget">` and currently falls back to `Alloy.createWidget(...)`.

## Implications

Required Alloy DevKit work:

- Compile XML `<Widget src="...">` / `<Require type="widget" src="...">` into static imports from `/alloy/widgets/<id>/controllers/<name>`.
- Compile literal app-authored `Alloy.createWidget('id', args)` into a static widget controller import and constructor call.
- Compile literal widget-authored `Widget.createController('child', args)` into static imports from the current widget's controllers directory.
- Migrate literal `require(WPATH('...'))` through codemods; Lambus has one real usage, and Alloy ESM mode now fails loudly instead of compiler-rewriting that legacy module load.

Preferred behavior:

- Do not introduce an eager global widget registry.
- Keep dynamic widget names unsupported until a real use case appears.
- Treat dynamic `Alloy.createController(...)` paths as separate migration work after widget support is in place.
