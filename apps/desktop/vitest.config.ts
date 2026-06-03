import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Renderer-side unit tests (Zustand store logic etc.). Mirrors the `@`/`@renderer`
// aliases from electron.vite.config.ts so test imports resolve the same way; the
// `@` entry only matches on a `/` boundary (rollup-alias semantics), so it never
// swallows `@sandcastle/*`. `node` env is enough — modules that touch
// window/document guard on `typeof`, and tests stub those where needed.
export default defineConfig({
	resolve: {
		alias: {
			"@renderer": resolve("src/renderer/src"),
			"@": resolve("src/renderer/src"),
		},
	},
	test: {
		include: ["src/renderer/src/**/*.test.ts"],
		environment: "node",
	},
});
