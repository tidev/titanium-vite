# Titanium Vite — Alpha Release Plan & Status

**Last updated:** 2026-06-15 (PR #2 merged; changesets release setup added)
**Goal:** Ship the first alpha of the Titanium Vite integration — publish the six
`@titanium-sdk/vite-*` packages to npm at `1.0.0-alpha.1`, with their dependency
chain (Alloy DevKit) and runtime hosts (Titanium CLI + SDK) in place.

This file is a handoff so work can resume in a fresh session. Update the
checkboxes as items land.

---

## Status at a glance

| Component | Role | State |
|---|---|---|
| `alloy-compiler` / `alloy-utils` (alloy-devkit) | npm deps of the alloy plugin | ✅ **Published** `1.0.0-beta.1` (`beta` tag) |
| `@titanium-sdk/vite-*` (this repo, 6 pkgs) | the integration | ✅ **Published** `1.0.0-alpha.1` (`alpha` tag) via changesets |
| `alloy` (runtime) | app dep | ✅ `3.0.1` on npm (verify ESM adapter compat) |
| `titanium` (Titanium CLI) | `ti serve` | ❌ `serve` command unreleased (on a branch) |
| Titanium SDK (`titanium_mobile`) | hosts Vite + plugins | ❌ Vite work unreleased (on `vite` branch) |

---

## Dependency / publish order

```
alloy-utils ─┐
             ├─> alloy-compiler ─> @titanium-sdk/vite-plugin-titanium-alloy ─┐
(published)  ┘                                                              │
                                                                            ├─> @titanium-sdk/vite-plugin-titanium
@titanium-sdk/vite-utils ───────────────────────────────────────────────────┤      (main package users install)
@titanium-sdk/polyfills ─────────────────────────────────────────────────────┤
@titanium-sdk/vite-titanium-environment ─────────────────────────────────────┘
@titanium-sdk/vite-codemod (standalone CLI)

Titanium SDK loads Vite + plugins from the app's node_modules (no npm dep).
Titanium CLI `ti serve` delegates to the SDK.
```

Publish leaf packages first, then the alloy plugin, then `vite-plugin-titanium`.
`pnpm -r publish` handles topological order and rewrites `workspace:*` → the
concrete version automatically.

---

## DONE ✅

### Alloy DevKit (`../alloy-devkit`, repo `tidev/alloy-devkit`, branch `develop`)
- [x] Published **`alloy-compiler@1.0.0-beta.1`** and **`alloy-utils@1.0.0-beta.1`**
      to npm under the **`beta`** dist-tag (`latest` stays `0.2.7`). Carries the
      Alloy ESM compiler work the alloy plugin needs.
- [x] Replaced **Lerna** with `pnpm -r publish` in the publish workflow.
- [x] Publish workflow trigger changed `created` → **`published`**, plus a
      **`workflow_dispatch`** fallback (inputs: `tag`, optional `dist_tag`).
- [x] Bumped `pnpm/action-setup` `@v4` → `@v6` (node24; clears deprecation).
- [x] Deleted the stale `v1.0.0-beta.0` GitHub release + tag (never published;
      its notes were folded into the beta.1 release).

### This repo (`tidev/titanium-vite`, default branch `main`)
- [x] **PR #1 (merged):** `vite-plugin-titanium-alloy` now depends on the
      published `alloy-compiler`/`alloy-utils` `^1.0.0-beta.1`; removed the local
      `link:` overrides from `pnpm-workspace.yaml`.
- [x] **PR #2 (merged, `fd6fa18`):** publish prep for all 6 packages at
      **`1.0.0-alpha.1`**:
  - `files` allowlist (`dist`, `src`, `!**/*.spec.*`) — required because `dist/`
    is gitignored; without it npm ships no compiled output.
  - `publishConfig.access: public` — scoped packages are restricted by default.
  - `prepack: pnpm build` on each package.
  - Metadata: descriptions, `author` (TiDev), `repository` + `directory`, `homepage`.
  - License `ISC` → **`Apache-2.0`** + `LICENSE` files (per package + repo root).
    ⚠️ Flagged for confirmation.
  - `apps/*` marked `private: true`.
  - Verified: all build; packed tarball rewrites `workspace:*` → `1.0.0-alpha.1`,
    includes dist+src+LICENSE, excludes specs.

---

## OPEN TODO ❌

### A. Land + publish this repo's packages
- [x] **License confirmed** = Apache-2.0 (maintainer decision 2026-06-15).
- [x] **Merge PR #2.** (`fd6fa18`)
- [x] **Publish mechanism = changesets** (maintainer decision 2026-06-15), scaffolded:
  - `@changesets/cli` + `.changeset/config.json`. The 6 publishable packages are
    grouped `fixed` so they always version in lockstep (preserves the same-version
    invariant `workspace:*` rewrites depend on). Private apps/tooling auto-ignored.
  - Repo is in **pre mode `alpha`** (`.changeset/pre.json`) → `version-packages`
    bumps `…-alpha.N`; `changeset publish` keys the dist-tag off the prerelease
    component, so releases land on **`alpha`** and `latest` stays clean.
  - Scripts: `changeset`, `version-packages`, `release` (build + publish).
  - `.github/workflows/release.yml` (changesets/action; push-to-main → opens a
    "Version Packages" PR, publishes on merge). **Needs `NPM_TOKEN` secret.**
  - Verified `pnpm -r publish --dry-run --tag alpha`: all 6 build + pack at alpha.1.
- [x] **npm publish rights** on the `@titanium-sdk` scope — confirmed; scope bootstrapped.
- [x] **Published** all 6 packages at `1.0.0-alpha.1` under the **`alpha`** dist-tag
      (verified live on npm 2026-06-15).
- [ ] Verify install from a clean consumer (`npm i @titanium-sdk/vite-plugin-titanium@alpha`).

### B. Titanium CLI (`../titanium-cli`, repo `tidev/titanium-cli`)
Two PRs, merge **in order** (pin first), then release. CI was red repo-wide
from three unrelated causes, all now fixed:
- [ ] **Merge PR #952 first** (`ci/pin-pnpm-version` → `main`), three fixes:
  1. **`fix(sdk)`: yauzl 3.3.0 → 3.4.0** — user-facing Node 24 bug. yauzl's
     piped inflate stream emits nothing for large deflate entries on Node 24, so
     `ti sdk install` stalls at the first big file (lodash.js, 544 KB) and Node 24
     aborts ("unsettled top-level await"). The SDK never installs on Node 24.
     Verified end-to-end. Lockfile patched surgically (yauzl + drop buffer-crc32).
  2. **`ci`: pin `packageManager: pnpm@10.33.3`** — CI crashed on Node 20 because
     `action-setup@v4 + version:latest` pulled pnpm 11 (needs Node ≥22.13 /
     `node:sqlite`).
  3. **`test(sdk)`: stabilize `sdk list`** — hardcoded the now-removed `12_6_X`
     branch; asserts any `\d+_\d+_X` branch instead.
  Supersedes the mis-based #947 (closed).
- [ ] **Then merge PR #910** (`vite-serve-command` → `main`,
      `feat: add serve command support`). Now also carries
      `fix(cli): restore variadic positional arg parsing` + regression tests —
      the serve branch's positional refactor had broken `sdk uninstall/install`
      variadic parsing (`TypeError: versions.filter is not a function`). After
      #952 lands, merge `main` into this branch so CI inherits the fixes.
      Bumps version to `8.2.0`.
- [ ] **Release `titanium@8.2.0`** so `ti serve` exists for alpha users.

### C. Titanium SDK (`../titanium_mobile`, branch `vite`)
- [ ] Commit/merge the `vite` branch (adds `cli/commands/serve.js`, the Vite
      bridge in `cli/lib/serve/`, native-module metadata passing). Branch had
      uncommitted changes at last check.
- [ ] Produce an installable SDK build (upstream release/RC, or a documented
      CI-build install). SDK ships via `ti sdk install`, not npm.

### D. Alloy runtime
- [ ] Verify `alloy@3.0.1` (on npm) includes the runtime compat layer that
      normalizes ESM-wrapped sync adapters (see `docs/alloy-esm-migration-notes.md`).
      Patch-release if missing. The example app pins `alloy: ^3.0.0`.

### Lower priority / known
- [ ] `references/liveview` still pins alloy `0.2.7` — intentionally left
      (vendored reference, outside the workspace).
- [ ] `rolldown@^1.0.0-rc.18` (RC) pinned in both plugins — acceptable for alpha.
- [ ] CI workflows: `release.yml` (changesets) added; CLA, lint, test still TBD.

---

## Key facts & gotchas (don't relearn these)

- **GitHub `release: published` does NOT reliably fire on a draft→publish
  transition** despite the docs. Both a UI "Publish release" and an API
  draft-toggle produced zero runs on alloy-devkit. The reliable path is
  **`workflow_dispatch`**:
  `gh workflow run publish.yml --ref develop -f tag=v1.0.0-beta.1`
  (dist-tag derives from the tag, e.g. `…-beta.1` → `beta`; override with
  `-f dist_tag=…`).
- **`dist/` is gitignored** in this repo → a `files` allowlist is mandatory for
  every published package, else the tarball has no compiled output.
- **Types are served from `src/index.ts`** (repo convention), so `src` must be in
  the tarball; consumers compile against the raw source.
- **`workspace:*` is rewritten on publish** by `pnpm -r publish` — only works
  correctly if intra-repo packages share the same version (they do: `1.0.0-alpha.1`).
- **`main` is protected** — push feature branches and open PRs; don't push to main.
- Alloy betas are on the **`beta`** tag; vite packages will go on **`alpha`**.
  `latest` must stay clean on all of them.

## Useful commands

```bash
# Build + verify a package tarball before publishing
pnpm build
cd packages/<pkg> && pnpm pack --pack-destination /tmp   # inspect with: tar -tzf

# Dry-run publish all
pnpm -r publish --dry-run --no-git-checks

# Alloy DevKit manual publish (the reliable path)
gh workflow run publish.yml -R tidev/alloy-devkit --ref develop -f tag=<vX.Y.Z>

# Check what's on npm
npm view @titanium-sdk/vite-plugin-titanium dist-tags --json
npm view alloy-compiler dist-tags --json
```

## Open questions for the maintainer
- ✅ License: Apache-2.0 — confirmed.
- ✅ Publish mechanism: changesets — decided + scaffolded.
- ⛔ `@titanium-sdk` npm scope publish access — **still open; this blocks first publish.**
      Once available, add `NPM_TOKEN` to repo secrets, then merge a changeset to main.
- SDK alpha distribution: upstream release vs documented CI build?
- Version line: stay on `1.0.0-alpha.x`, or reset to `0.x` for the alpha?
