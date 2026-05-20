import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	main: {},
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
