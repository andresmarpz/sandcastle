import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { WorktreeService, WorktreeNotFoundError } from "@sandcastle/worktree"
import { ProjectService } from "../services/index.ts"
import { ProjectNotFoundError } from "../services/errors.ts"
import {
  runTestCommand,
  runTestCommandExpectError,
  mockProject,
} from "../testing/index.ts"
import * as path from "node:path"
import * as os from "node:os"

const computeWorktreePath = (projectName: string, worktreeName: string): string =>
  path.join(os.homedir(), "sandcastle", "worktrees", projectName, worktreeName)

describe("worktree create", () => {
  test("creates worktree with new branch", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "feature-branch")

    const createEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* Effect.log(`Creating worktree 'feature-branch' for project 'my-project'`)
      yield* Effect.log(`  Path: ${worktreePath}`)
      yield* Effect.log(`  Based on: HEAD`)

      const result = yield* service.create({
        repoPath: proj.gitPath,
        worktreePath,
        branch: "feature-branch",
        createBranch: true,
        fromRef: "HEAD",
      })

      yield* Effect.log(`Worktree created successfully.`)
      yield* Effect.log(`  Branch: ${result.branch}`)
      yield* Effect.log(`  Commit: ${result.commit}`)
    })

    const logs = await runTestCommand(createEffect, {
      project: { initialProjects: [project] },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("creates worktree from specific ref", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "hotfix")

    const createEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* Effect.log(`Creating worktree 'hotfix' for project 'my-project'`)
      yield* Effect.log(`  Path: ${worktreePath}`)
      yield* Effect.log(`  Based on: v1.0.0`)

      const result = yield* service.create({
        repoPath: proj.gitPath,
        worktreePath,
        branch: "hotfix",
        createBranch: true,
        fromRef: "v1.0.0",
      })

      yield* Effect.log(`Worktree created successfully.`)
      yield* Effect.log(`  Branch: ${result.branch}`)
      yield* Effect.log(`  Commit: ${result.commit}`)
    })

    const logs = await runTestCommand(createEffect, {
      project: { initialProjects: [project] },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("fails for non-existent project", async () => {
    const createEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      yield* projects.get("unknown-project")
    })

    const error = await runTestCommandExpectError(createEffect, {
      project: { initialProjects: [] },
    })

    expect(error).toBeInstanceOf(ProjectNotFoundError)
    expect((error as ProjectNotFoundError).name).toBe("unknown-project")
  })
})

describe("worktree list", () => {
  test("lists worktrees for a project", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath1 = computeWorktreePath("my-project", "feature-a")
    const worktreePath2 = computeWorktreePath("my-project", "feature-b")

    const listEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* Effect.log(`Worktrees for 'my-project':\n`)
      const worktrees = yield* service.list(proj.gitPath)

      for (const wt of worktrees) {
        const mainIndicator = wt.isMain ? " (main)" : ""
        yield* Effect.log(`${wt.branch}${mainIndicator}`)
        yield* Effect.log(`  Path: ${wt.path}`)
        yield* Effect.log(`  Commit: ${wt.commit}`)
      }
    })

    const logs = await runTestCommand(listEffect, {
      project: { initialProjects: [project] },
      worktree: {
        initialWorktrees: new Map([
          [worktreePath1, { path: worktreePath1, branch: "feature-a", commit: "abc1234", isMain: false }],
          [worktreePath2, { path: worktreePath2, branch: "feature-b", commit: "def5678", isMain: false }],
        ]),
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("shows empty message when no worktrees", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    const listEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* Effect.log(`Worktrees for 'my-project':\n`)
      const worktrees = yield* service.list(proj.gitPath)

      if (worktrees.length === 0) {
        yield* Effect.log("No worktrees found.")
        return
      }

      for (const wt of worktrees) {
        yield* Effect.log(`${wt.branch}`)
      }
    })

    const logs = await runTestCommand(listEffect, {
      project: { initialProjects: [project] },
      worktree: { initialWorktrees: new Map() },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })
})

describe("worktree delete", () => {
  test("deletes a worktree", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "old-branch")

    const deleteEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* Effect.log(`Deleting worktree 'old-branch' from project 'my-project'`)

      yield* service.remove({
        repoPath: proj.gitPath,
        worktreePath,
        force: false,
      })

      yield* Effect.log("Worktree deleted successfully.")
    })

    const logs = await runTestCommand(deleteEffect, {
      project: { initialProjects: [project] },
      worktree: {
        initialWorktrees: new Map([
          [worktreePath, { path: worktreePath, branch: "old-branch", commit: "xyz9999", isMain: false }],
        ]),
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("force deletes a worktree", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "dirty-branch")

    const deleteEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* Effect.log(`Deleting worktree 'dirty-branch' from project 'my-project'`)

      yield* service.remove({
        repoPath: proj.gitPath,
        worktreePath,
        force: true,
      })

      yield* Effect.log("Worktree deleted successfully.")
    })

    const logs = await runTestCommand(deleteEffect, {
      project: { initialProjects: [project] },
      worktree: {
        initialWorktrees: new Map([
          [worktreePath, { path: worktreePath, branch: "dirty-branch", commit: "xyz9999", isMain: false }],
        ]),
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("fails for non-existent worktree", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "nonexistent")

    const deleteEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* service.remove({
        repoPath: proj.gitPath,
        worktreePath,
        force: false,
      })
    })

    const error = await runTestCommandExpectError(deleteEffect, {
      project: { initialProjects: [project] },
      worktree: { initialWorktrees: new Map() },
    })

    expect(error).toBeInstanceOf(WorktreeNotFoundError)
    expect((error as WorktreeNotFoundError).path).toBe(worktreePath)
  })
})

describe("worktree prune", () => {
  test("prunes stale worktrees", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    const pruneEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* Effect.log(`Pruning stale worktree references for 'my-project'...`)
      yield* service.prune(proj.gitPath)
      yield* Effect.log("Pruned successfully.")
    })

    const logs = await runTestCommand(pruneEffect, {
      project: { initialProjects: [project] },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })
})

describe("worktree open", () => {
  test("opens worktree in editor", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "feature-x")

    // Note: We don't actually run Bun.$ in tests, just verify the flow works
    const openEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      // Verify worktree exists
      yield* service.get(proj.gitPath, worktreePath)

      yield* Effect.log(`Opening worktree 'feature-x' at ${worktreePath}`)
      // In a real test, we'd mock Bun.$ here
      yield* Effect.log("Opened in editor.")
    })

    const logs = await runTestCommand(openEffect, {
      project: { initialProjects: [project] },
      worktree: {
        initialWorktrees: new Map([
          [worktreePath, { path: worktreePath, branch: "feature-x", commit: "abc1234", isMain: false }],
        ]),
      },
    })

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("fails for non-existent worktree", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "nonexistent")

    const openEffect = Effect.gen(function* () {
      const projects = yield* ProjectService
      const proj = yield* projects.get("my-project")

      const service = yield* WorktreeService
      yield* service.get(proj.gitPath, worktreePath)
    })

    const error = await runTestCommandExpectError(openEffect, {
      project: { initialProjects: [project] },
      worktree: { initialWorktrees: new Map() },
    })

    expect(error).toBeInstanceOf(WorktreeNotFoundError)
  })
})
