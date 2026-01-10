import type { SandcastleConfig } from "./types.ts";

/**
 * Helper for type-safe config definition.
 * Simply returns the config as-is, providing TypeScript inference.
 *
 * @example
 * ```typescript
 * // sandcastle.config.ts
 * import { defineConfig } from '@sandcastle/config'
 *
 * export default defineConfig({
 *   init: async (ctx) => {
 *     await ctx.exec('bun install')
 *     await ctx.copyFromBase('.env')
 *   }
 * })
 * ```
 */
export const defineConfig = (config: SandcastleConfig): SandcastleConfig =>
	config;
