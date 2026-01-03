import { Args, Command, Options } from "@effect/cli"
import { Console, Effect, Option } from "effect"
import { ProjectService } from "../services/index.ts"

// Arguments
const pathArg = Args.text({ name: "path" }).pipe(
  Args.withDescription("Path to the git repository")
)

const nameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Project name")
)

// Options
const nameOption = Options.text("name").pipe(
  Options.optional,
  Options.withDescription("Custom project name (defaults to directory name)")
)

// Commands
export const projectAdd = Command.make(
  "add",
  { path: pathArg, name: nameOption },
  ({ path, name }) =>
    Effect.gen(function* () {
      const projects = yield* ProjectService
      const customName = Option.getOrUndefined(name)

      const project = yield* projects.add(path, customName)

      yield* Console.log(`Project '${project.name}' registered.`)
      yield* Console.log(`  Path: ${project.gitPath}`)
    })
).pipe(Command.withDescription("Register a project with Sandcastle"))

export const projectList = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService
    const list = yield* projects.list()

    if (list.length === 0) {
      yield* Console.log("No projects registered.")
      return
    }

    yield* Console.log("Registered projects:\n")
    for (const p of list) {
      yield* Console.log(`${p.name}`)
      yield* Console.log(`  Path: ${p.gitPath}`)
    }
  })
).pipe(Command.withDescription("List all registered projects"))

export const projectRemove = Command.make(
  "remove",
  { name: nameArg },
  ({ name }) =>
    Effect.gen(function* () {
      const projects = yield* ProjectService

      yield* projects.remove(name)

      yield* Console.log(`Project '${name}' removed.`)
    })
).pipe(Command.withDescription("Unregister a project (keeps the repository)"))

// Parent command with subcommands
export const projectCommand = Command.make("project").pipe(
  Command.withDescription("Manage projects"),
  Command.withSubcommands([projectAdd, projectList, projectRemove])
)
