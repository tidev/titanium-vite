# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).
It holds the unreleased change notes that drive versioning and changelog
generation for the published `@titanium-sdk/vite-*` packages.

## Release flow (alpha)

The repo is in **pre-release mode** on the `alpha` tag (see `pre.json`). The six
publishable packages are grouped `fixed`, so they always release together at the
same version.

```bash
# 1. Describe a change (run on your feature branch)
pnpm changeset

# 2. Apply pending changesets -> bumps versions (1.0.0-alpha.N) + writes changelogs
pnpm version-packages

# 3. Build + publish to npm under the `alpha` dist-tag
pnpm release
```

`changeset publish` keys the dist-tag off the semver prerelease component, so
`x.y.z-alpha.N` versions land on the **`alpha`** tag and `latest` stays clean.

To graduate off alpha later: `pnpm changeset pre exit`, then a normal
`version-packages` + `release`.
