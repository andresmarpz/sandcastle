import { describe, test, expect } from "bun:test"
import { Effect, Option } from "effect"
import { ProjectService } from "../services/index.ts"
import {
  runTestCommand,
  runTestCommandExpectError,
  mockProject,
} from "../testing/index.ts"
import { ProjectNotFoundError, InvalidGitRepoError, ProjectExistsError } from "../services/errors.ts"

describe("project add", () => {
  test("successfully registers a project", async () => {
    const addEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const project = yield* projects.add("/path/to/valid-repo")
      yield* Effect.log(`Project '${project.name}' registered.`)
      yield* Effect.log(`  Path: ${project.gitPath}`)
    })

    const logs = await runTestCommand(addEffect, {
      project: {
        validGitPaths: new Set(["/path/to/valid-repo"]),
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("registers with custom name", async () => {
    const addEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const project = yield* projects.add("/path/to/repo", "my-custom-name")
      yield* Effect.log(`Project '${project.name}' registered.`)
      yield* Effect.log(`  Path: ${project.gitPath}`)
    })

    const logs = await runTestCommand(addEffect, {
      project: {
        validGitPaths: new Set(["/path/to/repo"]),
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("fails for non-git directories", async () => {
    const addEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      yield* projects.add("/not/a/git/repo")
    })

    const error = await runTestCommandExpectError(addEffect, {
      project: {
        validGitPaths: new Set(), // Empty = no valid paths
      },
    })

    expect(error).toBeInstanceOf(InvalidGitRepoError)
    expect((error as InvalidGitRepoError).path).toBe("/not/a/git/repo")
  })

  test("fails for duplicate project name", async () => {
    const existingProject = mockProject({ name: "existing-project", gitPath: "/path/to/existing" })

    const addEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      yield* projects.add("/path/to/new-repo", "existing-project")
    })

    const error = await runTestCommandExpectError(addEffect, {
      project: {
        validGitPaths: new Set(["/path/to/new-repo"]),
        initialProjects: [existingProject],
      },
    })

    expect(error).toBeInstanceOf(ProjectExistsError)
    expect((error as ProjectExistsError).name).toBe("existing-project")
  })
})

describe("project list", () => {
  test("lists all registered projects", async () => {
    const projects = [
      mockProject({ name: "alpha-project", gitPath: "/path/to/alpha" }),
      mockProject({ name: "beta-project", gitPath: "/path/to/beta" }),
      mockProject({ name: "gamma-project", gitPath: "/path/to/gamma" }),
    ]

    const listEffect = Effect.gen(function* () {
      const service = yield* ProjectService
      const list = yield* service.list()

      yield* Effect.log("Registered projects:\n")
      for (const p of list) {
        yield* Effect.log(`${p.name}`)
        yield* Effect.log(`  Path: ${p.gitPath}`)
      }
    })

    const logs = await runTestCommand(listEffect, {
      project: {
        initialProjects: projects,
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("shows empty message when no projects", async () => {
    const listEffect = Effect.gen(function* () {
      const service = yield* ProjectService
      const list = yield* service.list()

      if (list.length === 0) {
        yield* Effect.log("No projects registered.")
        return
      }

      yield* Effect.log("Registered projects:\n")
      for (const p of list) {
        yield* Effect.log(`${p.name}`)
        yield* Effect.log(`  Path: ${p.gitPath}`)
      }
    })

    const logs = await runTestCommand(listEffect, {
      project: {
        initialProjects: [],
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })
})

describe("project remove", () => {
  test("successfully removes a project", async () => {
    const existingProject = mockProject({ name: "to-remove", gitPath: "/path/to/remove" })

    const removeEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      yield* projects.remove("to-remove")
      yield* Effect.log("Project 'to-remove' removed.")
    })

    const logs = await runTestCommand(removeEffect, {
      project: {
        initialProjects: [existingProject],
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("fails for non-existent project", async () => {
    const removeEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      yield* projects.remove("unknown-project")
    })

    const error = await runTestCommandExpectError(removeEffect, {
      project: {
        initialProjects: [],
      },
    })

    expect(error).toBeInstanceOf(ProjectNotFoundError)
    expect((error as ProjectNotFoundError).name).toBe("unknown-project")
  })
})
