#!/usr/bin/env bun

/**
 * Version bump script for Sandcastle
 *
 * Usage:
 *   bun tooling/bump-version.ts <version>
 *   bun tooling/bump-version.ts patch|minor|major
 *
 * Examples:
 *   bun tooling/bump-version.ts 0.2.0
 *   bun tooling/bump-version.ts patch  # 0.1.0 -> 0.1.1
 *   bun tooling/bump-version.ts minor  # 0.1.0 -> 0.2.0
 *   bun tooling/bump-version.ts major  # 0.1.0 -> 1.0.0
 */

const ROOT = import.meta.dir + "/..";

// All files that need version updates
const PACKAGE_JSON_FILES = [
	"apps/desktop/package.json",
	"apps/web/package.json",
	"apps/http/package.json",
	"packages/ui/package.json",
	"packages/rpc/package.json",
	"packages/schemas/package.json",
	"packages/storage/package.json",
	"packages/tooling/package.json",
	"packages/petname/package.json",
	"packages/worktree/package.json",
];

const TAURI_CONF = "apps/desktop/src-tauri/tauri.conf.json";
const CARGO_TOML = "apps/desktop/src-tauri/Cargo.toml";

function parseVersion(version: string): [number, number, number] {
	const parts = version.split(".").map(Number);
	if (parts.length !== 3 || parts.some(isNaN)) {
		throw new Error(`Invalid version format: ${version}`);
	}
	return parts as [number, number, number];
}

function bumpVersion(
	current: string,
	type: "major" | "minor" | "patch",
): string {
	const [major, minor, patch] = parseVersion(current);
	switch (type) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
	}
}

async function getCurrentVersion(): Promise<string> {
	const tauriConf = await Bun.file(`${ROOT}/${TAURI_CONF}`).json();
	return tauriConf.version;
}

async function updatePackageJson(path: string, version: string): Promise<void> {
	const fullPath = `${ROOT}/${path}`;
	const content = await Bun.file(fullPath).json();
	content.version = version;
	await Bun.write(fullPath, JSON.stringify(content, null, "\t") + "\n");
}

async function updateTauriConf(version: string): Promise<void> {
	const fullPath = `${ROOT}/${TAURI_CONF}`;
	const content = await Bun.file(fullPath).json();
	content.version = version;
	await Bun.write(fullPath, JSON.stringify(content, null, "\t") + "\n");
}

async function updateCargoToml(version: string): Promise<void> {
	const fullPath = `${ROOT}/${CARGO_TOML}`;
	let content = await Bun.file(fullPath).text();
	content = content.replace(/^version = ".*"$/m, `version = "${version}"`);
	await Bun.write(fullPath, content);
}

async function main() {
	const arg = process.argv[2];

	if (!arg) {
		console.error("Usage: bun tooling/bump-version.ts <version|patch|minor|major>");
		process.exit(1);
	}

	const currentVersion = await getCurrentVersion();
	let newVersion: string;

	if (["patch", "minor", "major"].includes(arg)) {
		newVersion = bumpVersion(currentVersion, arg as "patch" | "minor" | "major");
	} else {
		// Validate it's a valid semver
		parseVersion(arg);
		newVersion = arg;
	}

	console.log(`Bumping version: ${currentVersion} → ${newVersion}\n`);

	// Update all package.json files
	for (const file of PACKAGE_JSON_FILES) {
		await updatePackageJson(file, newVersion);
		console.log(`  ✓ ${file}`);
	}

	// Update tauri.conf.json
	await updateTauriConf(newVersion);
	console.log(`  ✓ ${TAURI_CONF}`);

	// Update Cargo.toml
	await updateCargoToml(newVersion);
	console.log(`  ✓ ${CARGO_TOML}`);

	console.log(`\nDone! Updated ${PACKAGE_JSON_FILES.length + 2} files to v${newVersion}`);
}

main().catch((err) => {
	console.error("Error:", err.message);
	process.exit(1);
});
