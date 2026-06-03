# resources/bin — bundled native helpers

This directory holds the prebuilt **`abduco`** binaries that power PTY persistence
(running shells + their processes survive an app quit/relaunch). See the full design
in [`docs/pty-persistence.md`](../../../../docs/pty-persistence.md) — bundling is §7.

## What ships here

One binary per supported target, named exactly:

| File | Built on / for |
| --- | --- |
| `abduco-darwin-arm64` | macOS, Apple Silicon |
| `abduco-darwin-x64`   | macOS, Intel |
| `abduco-linux-x64`    | Linux, x86_64 |
| `abduco-linux-arm64`  | Linux, aarch64 |

The naming is `abduco-<platform>-<arch>` where `<platform>` is Node's
`process.platform` (`darwin` / `linux`) and `<arch>` is `process.arch`
(`arm64` / `x64`). `src/main/abduco.ts` resolves the binary by this exact name:

- **packaged:** `join(process.resourcesPath, "bin", "abduco-<platform>-<arch>")`
- **dev:** `join(app.getAppPath(), "resources", "bin", "abduco-<platform>-<arch>")`

abduco is unix-only, so there is **no Windows binary** — Windows keeps the
non-persistent spawn path (`PERSISTENCE_SUPPORTED === false`).

## How these binaries reach the packaged app

They are **not** imported by vite, so they are not part of the JS bundle. Instead
`electron-builder.yml` copies `resources/bin/abduco-*` into the packaged app's
`Resources/bin/` via `extraResources`. (They are also `asarUnpack`'d under
`resources/**`, which keeps the dev path runnable from outside the asar.)

## How to populate it

The binaries are **not committed** (only this README and `.gitkeep` are tracked) —
they're produced by the build script. Run it per target arch before packaging:

```sh
# From apps/desktop. Builds for the HOST arch and writes resources/bin/abduco-<host>.
scripts/build-abduco.sh
```

Cross-compiling C across arch/OS reliably is painful, so the script defaults to the
host target. To produce all four binaries, run the script on each target arch (e.g.
a CI matrix) or supply a matching cross toolchain and an explicit `TARGET`:

```sh
TARGET=linux-arm64 scripts/build-abduco.sh   # needs a matching CC/SDK
ABDUCO_VERSION=0.6 scripts/build-abduco.sh    # override the pinned version
```

The script fetches the **pinned abduco 0.6** release, verifies its SHA-256, runs
`make`, and drops the result at `resources/bin/abduco-<TARGET>`.

> **CI / release note:** the release pipeline (or you, for a local packaged build)
> must run `build-abduco.sh` for each shipped arch before `electron-builder`.
> Without the binaries present, PTY persistence silently falls back / fails to spawn.

## macOS notarization

Notarization is currently off (`notarize: false`). When it's enabled, this helper
needs `codesign` with hardened-runtime + inherited entitlements
(`build/entitlements.mac.plist`). Flag for whoever turns notarization on.

## License

abduco is ISC-licensed (friendly to bundle in a distributed app). Upstream:
<https://www.brain-dump.org/projects/abduco/> · <https://github.com/martanne/abduco>
