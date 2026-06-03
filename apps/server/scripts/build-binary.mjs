#!/usr/bin/env node
// Compile the Sandcastle backend into a single self-contained executable with
// `bun build --compile`. The output embeds the Bun runtime, the transpiled +
// minified + tree-shaken app, and the SQL migrations (imported as text), so it
// runs standalone with no Bun install and no source tree present.
//
// Used two ways:
//   1) `bun run build:binary`            → host target, into ./dist
//   2) electron-builder `beforePack`     → cross-compiled to the pack's arch,
//      into the dir electron-builder ships (apps/desktop/scripts/before-pack.cjs)
//
// Both go through here so target mapping and the binary name live in ONE place.
//
// Flags:
//   --platform=<darwin|win32|linux>  electron-style platform (default: host)
//   --arch=<x64|arm64>               electron-style arch     (default: host)
//   --target=<bun target>            override the bun --target directly
//   --outdir=<dir>                   output directory (default: ./dist)
//   --no-minify                      skip minification (faster dev builds)
//   --no-sourcemap                   skip the external sourcemap

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = "./src/main.ts";

// Stable base name the Electron sidecar manager looks for. Keep in sync with
// apps/desktop/src/main/server.ts (SERVER_BINARY_NAME).
export const BINARY_BASENAME = "sandcastle-server";

// electron platform+arch → bun --compile target triple.
const TARGETS = {
	"darwin:arm64": "bun-darwin-arm64",
	"darwin:x64": "bun-darwin-x64",
	"linux:x64": "bun-linux-x64",
	"linux:arm64": "bun-linux-arm64",
	"win32:x64": "bun-windows-x64",
};

const hostPlatform = process.platform; // darwin | win32 | linux
const hostArch = process.arch; // arm64 | x64

/** Resolve the bun target triple for an electron platform/arch pair. */
export function bunTargetFor(platform, arch) {
	const key = `${platform}:${arch}`;
	const target = TARGETS[key];
	if (!target) {
		throw new Error(
			`No bun --compile target for ${key}. Supported: ${Object.keys(TARGETS).join(", ")}`,
		);
	}
	return target;
}

/** Binary file name for a platform (Windows needs the .exe extension). */
export function binaryNameFor(platform) {
	return platform === "win32" ? `${BINARY_BASENAME}.exe` : BINARY_BASENAME;
}

/**
 * Compile the server binary. Returns the absolute path to the produced file.
 * @param {{platform?:string, arch?:string, target?:string, outdir?:string, minify?:boolean, sourcemap?:boolean}} opts
 */
export function buildServerBinary(opts = {}) {
	const platform = opts.platform ?? hostPlatform;
	const arch = opts.arch ?? hostArch;
	const target = opts.target ?? bunTargetFor(platform, arch);
	const outdir = resolve(opts.outdir ?? join(SERVER_ROOT, "dist"));
	const outfile = join(outdir, binaryNameFor(platform));
	const minify = opts.minify ?? true;
	const sourcemap = opts.sourcemap ?? true;

	mkdirSync(outdir, { recursive: true });

	const args = ["build", ENTRY, "--compile", `--target=${target}`, "--outfile", outfile];
	if (minify) args.push("--minify");
	if (sourcemap) args.push("--sourcemap");

	console.log(`[build-binary] bun ${args.join(" ")}  (cwd=${SERVER_ROOT})`);
	const res = spawnSync("bun", args, {
		cwd: SERVER_ROOT,
		stdio: "inherit",
		// On Windows `bun` is bun.exe; spawnSync resolves via PATHEXT with shell.
		shell: process.platform === "win32",
	});
	if (res.error) throw res.error;
	if (res.status !== 0) {
		throw new Error(`bun build exited with code ${res.status ?? res.signal}`);
	}
	return outfile;
}

// CLI entry — only when run directly, not when imported by the beforePack hook.
const invokedDirectly = process.argv[1]
	? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
	: false;

if (invokedDirectly) {
	const flags = new Map();
	for (const a of process.argv.slice(2)) {
		const m = a.match(/^--([^=]+)(?:=(.*))?$/);
		if (m) flags.set(m[1], m[2] ?? "true");
	}
	try {
		const out = buildServerBinary({
			platform: flags.get("platform"),
			arch: flags.get("arch"),
			target: flags.get("target"),
			outdir: flags.get("outdir"),
			minify: flags.get("no-minify") ? false : undefined,
			sourcemap: flags.get("no-sourcemap") ? false : undefined,
		});
		console.log(`[build-binary] wrote ${out}`);
	} catch (err) {
		console.error(`[build-binary] FAILED: ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	}
}
