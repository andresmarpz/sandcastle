// electron-builder `beforePack` hook: compile the Bun backend into a single
// self-contained executable for the arch being packed, and drop it where
// electron-builder will ship it (resources/sidecar, mapped to the app's
// Contents/Resources/sidecar via `extraResources`). The Electron main process
// resolves it at runtime with `join(process.resourcesPath, "sidecar", name)`.
//
// Runs once per platform/arch target, so multi-arch builds (e.g. mac arm64+x64)
// each get the correct cross-compiled binary right before that target is packed.
//
// Requires `bun` on PATH in the build environment (the repo's server toolchain).

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { Arch } = require("electron-builder");

/** Fail fast with an actionable message if Bun isn't on PATH, rather than a
 *  cryptic ENOENT deep inside the build. */
function assertBunAvailable() {
	const probe = spawnSync("bun", ["--version"], {
		stdio: "ignore",
		shell: process.platform === "win32",
	});
	if (probe.error || probe.status !== 0) {
		throw new Error(
			"[before-pack] `bun` not found on PATH. The backend sidecar is built with " +
				"`bun build --compile`; install Bun before packaging (CI: oven-sh/setup-bun; " +
				"local: https://bun.sh).",
		);
	}
}

/** @param {{ electronPlatformName: string, arch: number }} context */
exports.default = async function beforePack(context) {
	assertBunAvailable();
	const platform = context.electronPlatformName; // darwin | win32 | linux
	const arch = Arch[context.arch]; // x64 | arm64 | ...
	const outdir = join(__dirname, "..", "resources", "sidecar");
	const buildScript = join(__dirname, "..", "..", "server", "scripts", "build-binary.mjs");

	console.log(`[before-pack] compiling backend sidecar for ${platform}/${arch}`);
	const res = spawnSync(
		process.execPath, // the Node running electron-builder
		[
			buildScript,
			`--platform=${platform}`,
			`--arch=${arch}`,
			`--outdir=${outdir}`,
			// Keep the shipped binary lean; minify stays on (build script default).
			"--no-sourcemap",
		],
		{ stdio: "inherit" },
	);
	if (res.error) throw res.error;
	if (res.status !== 0) {
		throw new Error(
			`[before-pack] backend sidecar build failed (status ${res.status ?? res.signal})`,
		);
	}
};
