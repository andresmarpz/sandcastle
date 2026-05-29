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
			externalizeDeps: {
				exclude: ["@modelcontextprotocol/sdk", "zod"],
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
