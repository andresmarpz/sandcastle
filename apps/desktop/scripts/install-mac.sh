#!/usr/bin/env bash
# Local install: build a real .app, ad-hoc sign it, copy to /Applications, open.
# This is what you run when you want a "stable" Sandcastle on your machine that
# lives alongside `pnpm dev`. Both can run simultaneously because the packaged
# build and dev build use distinct APP_IDs (see src/main/index.ts).
set -euo pipefail

APP_NAME="Sandcastle"
INSTALL_DIR="/Applications"
INSTALLED_APP="${INSTALL_DIR}/${APP_NAME}.app"

cd "$(dirname "$0")/.."

echo "==> Building renderer + main"
pnpm run build

echo "==> Packaging .app (skipping dmg)"
pnpm exec electron-builder --mac --dir

# electron-builder writes to dist/mac-<arch>/<productName>.app. Pick whichever exists.
BUILT_APP=$(ls -d dist/mac*/"${APP_NAME}.app" 2>/dev/null | head -n 1 || true)
if [[ -z "${BUILT_APP}" || ! -d "${BUILT_APP}" ]]; then
  echo "ERROR: could not find built .app under dist/mac*/${APP_NAME}.app" >&2
  ls -la dist/ >&2 || true
  exit 1
fi
echo "    found: ${BUILT_APP}"

echo "==> Ad-hoc signing (no Developer ID needed for local use)"
codesign --force --deep --sign - "${BUILT_APP}"

echo "==> Stripping com.apple.quarantine (if present)"
xattr -dr com.apple.quarantine "${BUILT_APP}" 2>/dev/null || true

echo "==> Quitting any running ${APP_NAME}"
osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
# Give it a moment to release file locks.
sleep 1

echo "==> Installing to ${INSTALLED_APP}"
rm -rf "${INSTALLED_APP}"
cp -R "${BUILT_APP}" "${INSTALL_DIR}/"

echo "==> Launching"
open "${INSTALLED_APP}"

echo ""
echo "Done. ${APP_NAME} is installed at ${INSTALLED_APP}."
echo "Run \`pnpm dev\` in this repo to launch the HMR dev build alongside it."
