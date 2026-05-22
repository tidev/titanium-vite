# Known Issues

## pnpm workspace installs and Titanium node_modules copying

Titanium SDK copies runtime npm packages from the app project's `node_modules`
directory into the native app bundle. The Titanium runtime then resolves those
packages with its Node-style CommonJS module resolver.

pnpm's default workspace layout stores package contents in the workspace-level
virtual store and exposes app dependencies through symlinks. In that layout,
Titanium SDK's current `module-copier` can see the app's direct dependency link,
but it can miss transitive dependencies from the pnpm virtual store. For example,
the classic app's `is-odd` dependency can be copied without its transitive
`is-number` dependency, causing a runtime error such as:

```text
Requested module not found: is-number
```

The workspace currently uses this pnpm compatibility configuration:

```yaml
nodeLinker: hoisted
sharedWorkspaceLockfile: false
```

This creates app-local, npm-style `node_modules` trees so Titanium SDK can copy
the complete runtime dependency closure from each app directory.

Side effects:

- pnpm writes per-project `pnpm-lock.yaml` files.
- Turbo may warn that it cannot calculate transitive closures from the root
  lockfile alone.
- Vite-facing packages declare Vite as a peer and resolve the workspace-root
  Vite install during local development to avoid duplicate Vite type identities.

This is a compatibility workaround. The cleaner long-term fix is for Titanium
SDK's module copier to understand pnpm's default workspace symlink layout and
materialize a Node-resolvable dependency tree in the app bundle.
