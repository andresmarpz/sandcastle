import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [
		react({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
		tailwindcss(),
		tsconfigPaths({
			// Include both the desktop app and UI package tsconfigs
			projects: [".", "../../packages/ui"],
		}),
	],
	clearScreen: false,
}));
