import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
	{
		ignores: ["node_modules", "out", "dist", "build", ".turbo", "resources"],
	},
	{
		files: ["src/renderer/src/**/*.{ts,tsx,js,jsx}"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				ecmaFeatures: { jsx: true },
			},
		},
		...reactHooks.configs.flat.recommended,
	},
];
