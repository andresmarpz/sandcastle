# Sandcastle

A desktop app for managing git worktrees and terminal-based agent workspaces. Built with Electron, React, and TypeScript in a pnpm + Turborepo monorepo.

## Download & install

Grab the latest build for your platform from the [**Releases**](https://github.com/andresmarpz/sandcastle/releases/latest) page.

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `sandcastle-<version>-arm64.dmg` |
| macOS (Intel) | `sandcastle-<version>-x64.dmg` |
| Windows | `sandcastle-<version>-setup-*.exe` |
| Linux | `sandcastle-<version>-*.AppImage` or `.deb` |

### macOS — first launch

These builds are **not yet signed with an Apple Developer ID**, so macOS Gatekeeper will block the first launch. To open it once:

1. Open the `.dmg` and drag **Sandcastle** to **Applications**.
2. In Finder, **right-click** (or Control-click) `Sandcastle.app` → **Open**, then confirm **Open** in the dialog.

   If macOS says the app is *"damaged"* (this happens on downloaded, unsigned apps), clear the quarantine flag once:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Sandcastle.app
   ```

After the first launch, it opens normally. Signing + notarization is wired up and will remove this step entirely once Apple Developer credentials are added (see [Releasing](#releasing)).

## Development

```bash
pnpm install
pnpm dev          # run the desktop app with HMR
pnpm quality      # typecheck + biome check
pnpm build        # production build
```

## Releasing

Releases are produced by GitHub Actions (`.github/workflows/release.yml`):

1. Bump the version in the root `package.json` and `apps/desktop/package.json`.
2. Tag and push: `git tag v<version> && git push origin v<version>`.
3. The workflow builds installers on macOS (arm64 + x64), Windows, and Linux, uploads them to a draft GitHub Release, then publishes it.

### Enabling macOS code signing + notarization

The release workflow already passes the signing environment variables. To produce Gatekeeper-approved builds, add these repository secrets:

| Secret | Description |
| --- | --- |
| `MAC_CSC_LINK` | base64-encoded Developer ID Application `.p12` certificate |
| `MAC_CSC_KEY_PASSWORD` | password for that `.p12` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

Then set `mac.notarize: true` in `apps/desktop/electron-builder.yml`. No other changes are required.
