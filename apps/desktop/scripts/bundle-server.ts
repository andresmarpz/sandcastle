#!/usr/bin/env bun
/**
 * Bundle the HTTP server for sidecar distribution.
 * Output: apps/desktop/src-tauri/binaries/server.js
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "../src-tauri/binaries");
const SERVER_ENTRY = join(__dirname, "../../http/src/server.ts");

await mkdir(OUTPUT_DIR, { recursive: true });

console.log("Bundling server...");
console.log(`  Entry: ${SERVER_ENTRY}`);
console.log(`  Output: ${OUTPUT_DIR}/server.js`);

const result = await Bun.build({
	entrypoints: [SERVER_ENTRY],
	outdir: OUTPUT_DIR,
	target: "bun",
	naming: "server.js",
	sourcemap: "linked",
});

if (!result.success) {
	console.error("Build failed:");
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

const outputFile = Bun.file(join(OUTPUT_DIR, "server.js"));
const stat = await outputFile.stat();
const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

console.log(`\nServer bundled successfully!`);
console.log(`  Size: ${sizeMB} MB`);
console.log(`  Modules: ${result.outputs.length}`);
