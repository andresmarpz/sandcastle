#!/usr/bin/env bash
# Build the bundled `abduco` binary for PTY persistence (see docs/pty-persistence.md §7).
#
# Fetches a pinned abduco release, compiles it, and drops the result at
#   resources/bin/abduco-<platform>-<arch>
# where <platform>/<arch> match Node's process.platform / process.arch values
# (darwin|linux, arm64|x64). src/main/abduco.ts resolves the binary by that exact
# name, and electron-builder.yml ships resources/bin/* into the app's Resources/bin.
#
# abduco is a tiny single-file ISC-licensed C program, so the build is just `make`.
# Cross-compiling C reliably is painful, so by default this builds ONLY for the host
# (the arch you're running on). CI should run it on each target arch (or under the
# matching cross toolchain) to populate all four binaries; see "TARGET" below.
#
# Usage:
#   scripts/build-abduco.sh                 # build for the host platform/arch
#   TARGET=linux-arm64 scripts/build-abduco.sh   # build for an explicit target
#                                                # (requires a matching CC/toolchain)
#   ABDUCO_VERSION=0.6 scripts/build-abduco.sh   # override the pinned version
#
# Requirements: curl (or wget), tar, make, a C compiler (cc/clang/gcc), shasum/sha256sum.
set -euo pipefail

# --- Pinned release -----------------------------------------------------------
# abduco 0.6 (2016-03-24). Source of truth: https://www.brain-dump.org/projects/abduco/
ABDUCO_VERSION="${ABDUCO_VERSION:-0.6}"
TARBALL="abduco-${ABDUCO_VERSION}.tar.gz"
PRIMARY_URL="https://www.brain-dump.org/projects/abduco/${TARBALL}"
# GitHub mirror fallback (martanne/abduco), same source for the tagged release.
FALLBACK_URL="https://github.com/martanne/abduco/archive/refs/tags/v${ABDUCO_VERSION}.tar.gz"

# Known-good SHA-256 for abduco-0.6.tar.gz from brain-dump.org. Only enforced when
# the pinned version is 0.6; override the version and this check self-disables.
EXPECTED_SHA256_0_6="00b1cb39a1130d839a17222eb40b738e75a6ef41ef0e8364c8e928241d40c772"

# --- Paths --------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${DESKTOP_DIR}/resources/bin"

# --- Resolve the target triple (Node-style) -----------------------------------
node_platform() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    *)
      echo "unsupported OS '$(uname -s)' — abduco/PTY persistence is unix-only" >&2
      exit 1
      ;;
  esac
}

node_arch() {
  case "$(uname -m)" in
    arm64 | aarch64) echo "arm64" ;;
    x86_64 | amd64) echo "x64" ;;
    *)
      echo "unsupported arch '$(uname -m)'" >&2
      exit 1
      ;;
  esac
}

# TARGET selects which output name we write. Default = host. A non-host TARGET only
# works if a matching cross toolchain (CC / SDK) is configured in the environment.
HOST_TARGET="$(node_platform)-$(node_arch)"
TARGET="${TARGET:-${HOST_TARGET}}"

case "${TARGET}" in
  darwin-arm64 | darwin-x64 | linux-x64 | linux-arm64) ;;
  *)
    echo "ERROR: unknown TARGET '${TARGET}'." >&2
    echo "       Valid: darwin-arm64 | darwin-x64 | linux-x64 | linux-arm64" >&2
    exit 1
    ;;
esac

if [[ "${TARGET}" != "${HOST_TARGET}" ]]; then
  echo "WARNING: building for '${TARGET}' on host '${HOST_TARGET}'." >&2
  echo "         You must provide a matching cross toolchain (CC/SDKROOT/etc)." >&2
fi

OUT_BIN="${OUT_DIR}/abduco-${TARGET}"

# --- Tooling helpers ----------------------------------------------------------
fetch() {
  # fetch <url> <dest>
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${url}" -o "${dest}"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "${dest}" "${url}"
  else
    echo "ERROR: need curl or wget to download ${url}" >&2
    exit 1
  fi
}

sha256_of() {
  # sha256_of <file> -> hex digest on stdout
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file}" | awk '{print $1}'
  else
    echo "ERROR: need sha256sum or shasum to verify the download" >&2
    exit 1
  fi
}

# --- Build --------------------------------------------------------------------
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/abduco-build.XXXXXX")"
cleanup() { rm -rf "${WORK_DIR}"; }
trap cleanup EXIT

echo "==> Fetching abduco ${ABDUCO_VERSION}"
TARBALL_PATH="${WORK_DIR}/${TARBALL}"
if ! fetch "${PRIMARY_URL}" "${TARBALL_PATH}"; then
  echo "    primary URL failed, trying GitHub mirror"
  fetch "${FALLBACK_URL}" "${TARBALL_PATH}"
fi

if [[ "${ABDUCO_VERSION}" == "0.6" ]]; then
  GOT="$(sha256_of "${TARBALL_PATH}")"
  if [[ "${GOT}" != "${EXPECTED_SHA256_0_6}" ]]; then
    echo "ERROR: checksum mismatch for ${TARBALL}" >&2
    echo "       expected ${EXPECTED_SHA256_0_6}" >&2
    echo "       got      ${GOT}" >&2
    echo "       (a mirror tarball may repack the source and differ; verify before trusting)" >&2
    exit 1
  fi
  echo "    checksum OK"
fi

echo "==> Extracting"
tar -xzf "${TARBALL_PATH}" -C "${WORK_DIR}"
# Upstream tarball extracts to abduco-<version>/; the GitHub archive does too.
SRC_DIR="$(find "${WORK_DIR}" -maxdepth 1 -type d -name 'abduco-*' | head -n 1)"
if [[ -z "${SRC_DIR}" ]]; then
  echo "ERROR: could not locate extracted abduco source dir" >&2
  exit 1
fi

echo "==> Building (make) in ${SRC_DIR}"
make -C "${SRC_DIR}" clean >/dev/null 2>&1 || true
make -C "${SRC_DIR}"

echo "==> Installing to ${OUT_BIN}"
mkdir -p "${OUT_DIR}"
cp "${SRC_DIR}/abduco" "${OUT_BIN}"
chmod +x "${OUT_BIN}"

echo ""
echo "Done. Built abduco ${ABDUCO_VERSION} -> ${OUT_BIN}"
echo "Targets needed for a full release: darwin-arm64, darwin-x64, linux-x64, linux-arm64."
echo "Run this on (or cross-compile for) each arch before electron-builder."
