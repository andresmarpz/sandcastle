// electron-builder `beforePack` hook — build & stage the bundled `abduco` binary
// for PTY persistence (see docs/pty-persistence.md §7) so BOTH `pnpm install:mac`
// and the release CI matrix package it, without anyone having to remember to run
// scripts/build-abduco.sh first. Wired via `beforePack:` in electron-builder.yml;
// electron-builder calls this once per (platform, arch) it packs.
//
// No cross-compilation: the release matrix builds each target on its NATIVE runner
// (macos-14 = arm64, macos-13 = x64, ubuntu = linux-x64) and `install:mac` builds
// the host arch, so the target arch here always equals the host arch and plain
// `make` in build-abduco.sh works with no cross toolchain. Windows is skipped —
// abduco is unix-only and src/main/abduco.ts gates persistence behind
// PERSISTENCE_SUPPORTED.

const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

// electron-builder's Arch enum (builder-util) -> the Node process.arch-style names
// used by build-abduco.sh and src/main/abduco.ts (abduco-<platform>-<arch>).
const ARCH_NAMES = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" };

module.exports = async function beforePack(context) {
	const platform = context.electronPlatformName; // "darwin" | "win32" | "linux"
	if (platform === "win32") {
		console.log("[abduco] skipping — Windows has no abduco / PTY persistence");
		return;
	}

	const arch = ARCH_NAMES[context.arch] ?? String(context.arch);
	const target = `${platform}-${arch}`;
	const scriptsDir = __dirname;
	const outBin = join(scriptsDir, "..", "resources", "bin", `abduco-${target}`);

	if (existsSync(outBin)) {
		console.log(`[abduco] ${target} already present (${outBin}) — skipping build`);
		return;
	}

	console.log(`[abduco] building ${target} via scripts/build-abduco.sh`);
	execFileSync("bash", [join(scriptsDir, "build-abduco.sh")], {
		stdio: "inherit",
		env: { ...process.env, TARGET: target },
	});

	if (!existsSync(outBin)) {
		throw new Error(`[abduco] build-abduco.sh ran but did not produce ${outBin}`);
	}
};
