import { Args, Command, Options } from "@effect/cli"
import { Console, Effect, Option } from "effect"
import { WorktreeService } from "@sandcastle/worktree"
import { petname } from "@sandcastle/petname"
import { ProjectService } from "../services/index.ts"
import * as path from "node:path"
import * as os from "node:os"

// Helper to compute worktree path using project name
const computeWorktreePath = (projectName: string, worktreeName: string): string => {
  return path.join(os.homedir(), "sandcastle", "worktrees", projectName, worktreeName)
}

// Arguments
const projectArg = Args.text({ name: "project" }).pipe(
  Args.withDescription("Project name (registered with 'project add')")
)

const worktreeNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Worktree/branch name (auto-generated if not provided)"),
  Args.optional
)

const worktreeNameArgRequired = Args.text({ name: "name" }).pipe(
  Args.withDescription("Worktree/branch name")
)

// Options
const fromOption = Options.text("from").pipe(
  Options.optional,
  Options.withDescription("Branch or ref to base the worktree from (defaults to HEAD)")
)

const forceOption = Options.boolean("force").pipe(
  Options.withAlias("f"),
  Options.withDescription("Force removal even if worktree is dirty")
)

const editorOption = Options.text("editor").pipe(
  Options.optional,
  Options.withAlias("e"),
  Options.withDescription("Editor command to use (default: cursor)")
)

const openOption = Options.boolean("open").pipe(
  Options.withAlias("o"),
  Options.withDescription("Open worktree in editor after creation")
)

// Commands
export const worktreeCreate = Command.make(
  "create",
  { project: projectArg, name: worktreeNameArg, from: fromOption, open: openOption, editor: editorOption },
  ({ project, name, from, open, editor }) =>
    Effect.gen(function* () {
      // Resolve project name to repo path
      const projects = yield* ProjectService
      const proj = yield* projects.get(project)
      const repoPath = proj.gitPath

      // Use provided name or auto-generate with petname
      const name = Option.getOrElse(nameOption, () => petname())

      const service = yield* WorktreeService
      const worktreePath = computeWorktreePath(proj.name, name)
      const fromRef = Option.getOrElse(from, () => "HEAD")

      yield* Console.log(`Creating worktree '${name}' for project '${project}'`)
      yield* Console.log(`  Path: ${worktreePath}`)
      yield* Console.log(`  Based on: ${fromRef}`)

      const result = yield* service.create({
        repoPath,
        worktreePath,
        branch: name,
        createBranch: true,
        fromRef,
      })

      yield* Console.log(`Worktree created successfully.`)
      yield* Console.log(`  Branch: ${result.branch}`)
      yield* Console.log(`  Commit: ${result.commit}`)

      // Open in editor if requested
      if (open) {
        const editorCmd = Option.getOrElse(editor, () => "cursor")
        yield* Effect.promise(() =>
          Bun.$`${editorCmd} ${worktreePath}`.quiet()
        )
        yield* Console.log(`Opened in ${editorCmd}.`)
      }
    })
).pipe(Command.withDescription("Create a new worktree for a project"))

export const worktreeList = Command.make(
  "list",
  { project: projectArg },
  ({ project }) =>
    Effect.gen(function* () {
      // Resolve project name to repo path
      const projects = yield* ProjectService
      const proj = yield* projects.get(project)

      const service = yield* WorktreeService

      yield* Console.log(`Worktrees for '${project}':\n`)
      const worktrees = yield* service.list(proj.gitPath)

      if (worktrees.length === 0) {
        yield* Console.log("No worktrees found.")
        return
      }

      for (const wt of worktrees) {
        const mainIndicator = wt.isMain ? " (main)" : ""
        yield* Console.log(`${wt.branch}${mainIndicator}`)
        yield* Console.log(`  Path: ${wt.path}`)
        yield* Console.log(`  Commit: ${wt.commit}`)
      }
    })
).pipe(Command.withDescription("List worktrees for a project"))

export const worktreeDelete = Command.make(
  "delete",
  { project: projectArg, name: worktreeNameArgRequired, force: forceOption },
  ({ project, name, force }) =>
    Effect.gen(function* () {
      // Resolve project name to repo path
      const projects = yield* ProjectService
      const proj = yield* projects.get(project)

      const service = yield* WorktreeService
      const worktreePath = computeWorktreePath(proj.name, name)

      yield* Console.log(`Deleting worktree '${name}' from project '${project}'`)

      yield* service.remove({
        repoPath: proj.gitPath,
        worktreePath,
        force,
      })

      yield* Console.log("Worktree deleted successfully.")
    })
).pipe(Command.withDescription("Delete a worktree"))

export const worktreeOpen = Command.make(
  "open",
  { project: projectArg, name: worktreeNameArg, editor: editorOption },
  ({ project, name, editor }) =>
    Effect.gen(function* () {
      // Resolve project name to repo path
      const projects = yield* ProjectService
      const proj = yield* projects.get(project)

      const service = yield* WorktreeService
      const worktreePath = computeWorktreePath(proj.name, name)

      // Verify worktree exists
      yield* service.get(proj.gitPath, worktreePath)

      const editorCmd = Option.getOrElse(editor, () => "cursor")
      yield* Console.log(`Opening worktree '${name}' at ${worktreePath}`)

      yield* Effect.promise(() =>
        Bun.$`${editorCmd} ${worktreePath}`.quiet()
      )

      yield* Console.log(`Opened in ${editorCmd}.`)
    })
).pipe(Command.withDescription("Open a worktree in your editor"))

export const worktreePrune = Command.make(
  "prune",
  { project: projectArg },
  ({ project }) =>
    Effect.gen(function* () {
      // Resolve project name to repo path
      const projects = yield* ProjectService
      const proj = yield* projects.get(project)

      const service = yield* WorktreeService

      yield* Console.log(`Pruning stale worktree references for '${project}'...`)
      yield* service.prune(proj.gitPath)
      yield* Console.log("Pruned successfully.")
    })
).pipe(Command.withDescription("Clean up stale worktree references"))

// Parent command with subcommands
export const worktreeCommand = Command.make("worktree").pipe(
  Command.withDescription("Manage worktrees"),
  Command.withSubcommands([worktreeCreate, worktreeList, worktreeDelete, worktreeOpen, worktreePrune])
)
