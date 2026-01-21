#!/usr/bin/env bun
/**
 * Set up sidecar binaries for local development testing.
 * Copies the local Bun binary with the correct platform suffix.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARIES_DIR = join(__dirname, "../src-tauri/binaries");

// Detect platform
const platform = process.platform;
const arch = process.arch;

type PlatformSuffix = string;

const PLATFORM_MAP: Record<string, Record<string, PlatformSuffix>> = {
	darwin: {
		arm64: "aarch64-apple-darwin",
		x64: "x86_64-apple-darwin",
	},
	linux: {
		x64: "x86_64-unknown-linux-gnu",
		arm64: "aarch64-unknown-linux-gnu",
	},
	win32: {
		x64: "x86_64-pc-windows-msvc.exe",
		arm64: "aarch64-pc-windows-msvc.exe",
	},
};

const suffix = PLATFORM_MAP[platform]?.[arch];

if (!suffix) {
	console.error(`Unsupported platform: ${platform}-${arch}`);
	process.exit(1);
}

await mkdir(BINARIES_DIR, { recursive: true });

// Find local bun path
const bunPath = Bun.which("bun");
if (!bunPath) {
	console.error("Bun not found in PATH");
	process.exit(1);
}

const targetPath = join(BINARIES_DIR, `bun-${suffix}`);

console.log(`Setting up sidecar for ${platform}-${arch}...`);
console.log(`  Source: ${bunPath}`);
console.log(`  Target: ${targetPath}`);

await copyFile(bunPath, targetPath);

// Make executable on Unix
if (platform !== "win32") {
	const { chmod } = await import("node:fs/promises");
	await chmod(targetPath, 0o755);
}

console.log("\nBun binary copied successfully!");

// Also bundle the server
console.log("\nBundling server...");
const bundleScript = join(__dirname, "bundle-server.ts");
const proc = Bun.spawn(["bun", bundleScript], {
	stdout: "inherit",
	stderr: "inherit",
});
await proc.exited;

if (proc.exitCode !== 0) {
	console.error("Failed to bundle server");
	process.exit(1);
}

console.log("\nSidecar setup complete! You can now run:");
console.log("  bun run tauri build");
