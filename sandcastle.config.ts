import { defineConfig } from "@sandcastle/config"

export default defineConfig({
  init: async (ctx) => {
    ctx.log("Installing dependencies...")
    await ctx.exec("bun install")
    ctx.log("Worktree ready!")
  },
})
