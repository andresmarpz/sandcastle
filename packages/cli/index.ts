#!/usr/bin/env bun
import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { ConfigServiceLive } from "@sandcastle/config"
import { WorktreeServiceLive } from "@sandcastle/worktree"
import { ProjectServiceLive } from "./services/index.ts"
import { projectCommand, worktreeCommand } from "./commands/index.ts"

// Root command
const sandcastle = Command.make("sandcastle").pipe(
  Command.withDescription("Manage coding agents and git worktrees"),
  Command.withSubcommands([projectCommand, worktreeCommand])
)

// Create CLI runner
const cli = Command.run(sandcastle, {
  name: "Sandcastle",
  version: "0.1.0"
})

// Combine all layers
const MainLayer = Layer.mergeAll(
  NodeContext.layer,
  ConfigServiceLive,
  WorktreeServiceLive,
  ProjectServiceLive
)

// Run the CLI
cli(process.argv).pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
