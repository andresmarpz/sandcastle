import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
	main: {
		build: {
			// electron-vite externalizes all package.json deps by default, which
			// would `require()` these at runtime — but the MCP SDK is ESM-only and
			// the main bundle is CJS, so it must be bundled (transpiled) instead.
			// node-pty (native) stays externalized as usual.
			//
			// effect must also be bundled: its barrel eagerly re-exports Schema,
			// which statically imports testing/FastCheck.js -> `fast-check`. Left
			// externalized, the packaged app `require()`s effect and Node walks
			// that graph, but electron-builder's pnpm tracer never copied
			// fast-check into app.asar -> ERR_MODULE_NOT_FOUND at launch. Bundling
			// tree-shakes the unused Schema/testing branch away (sideEffects: []),
			// dropping the fast-check reference entirely.
			externalizeDeps: {
				exclude: ["@modelcontextprotocol/sdk", "zod", "effect"],
			},
		},
	},
	preload: {},
	renderer: {
		resolve: {
			alias: {
				"@renderer": resolve("src/renderer/src"),
				"@": resolve("src/renderer/src"),
			},
		},
		plugins: [
			react({
				babel: {
					plugins: [["babel-plugin-react-compiler", {}]],
				},
			}),
			tailwindcss(),
		],
	},
});
