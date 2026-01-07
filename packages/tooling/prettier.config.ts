import type { PluginConfig } from "@ianvs/prettier-plugin-sort-imports";
import type { Config } from "prettier";

/**
 * @see https://prettier.io/docs/configuration
 */
const config: Config & PluginConfig = {
  trailingComma: "none",
  tabWidth: 2,
  semi: true,
  singleQuote: false,
  arrowParens: "avoid",
  endOfLine: "auto",
  printWidth: 100,

  // Import sorting
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: [
    "<BUILTIN_MODULES>", // Node.js built-ins
    "",
    "<THIRD_PARTY_MODULES>", // External packages
    "",
    "^@sandcastle/(.*)$", // Monorepo packages
    "",
    "^@/(.*)$", // Path alias imports
    "^[./]" // Relative imports
  ],
  importOrderTypeScriptVersion: "5.0.0"
};

export default config;
