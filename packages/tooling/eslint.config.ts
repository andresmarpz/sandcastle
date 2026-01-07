import js from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared ESLint configuration for TypeScript projects.
 *
 * Usage in consuming packages:
 * ```ts
 * import baseConfig from "@sandcastle/tooling/eslint";
 * export default [...baseConfig];
 * ```
 */
export default defineConfig(
  // Global ignores for build output directories
  globalIgnores(["**/node_modules/**", "**/dist/**", "**/target/**"]),

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // React configuration
  {
    files: ["**/*.{jsx,tsx}"],
    ...pluginReact.configs.flat?.recommended,
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...pluginReact.configs.flat?.recommended?.rules,
      // Using JSX transform (React 17+), no need to import React
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off" // TypeScript handles prop validation
    }
  },

  // React Hooks rules (essential for correctness)
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "react-hooks": pluginReactHooks
    },
    rules: pluginReactHooks.configs.recommended.rules
  },

  // Global settings
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },

  // TypeScript-specific rules
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // Prefer explicit over implicit for clarity
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],

      // Enforce consistency
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],

      // Prevent common mistakes
      "@typescript-eslint/no-floating-promises": "off", // Requires type-checked config
      "@typescript-eslint/no-misused-promises": "off" // Requires type-checked config
    }
  },

  // General best practices
  {
    rules: {
      // Prevent accidental console.log in production code
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],

      // Enforce consistent code style
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      "object-shorthand": "error",

      // Prevent common bugs
      "no-implicit-coercion": "error",
      "no-param-reassign": ["error", { props: false }]
    }
  }
);
