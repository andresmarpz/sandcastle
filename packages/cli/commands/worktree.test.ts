import { describe, test, expect } from "bun:test"
import { Option } from "effect"
import { WorktreeNotFoundError } from "@sandcastle/worktree"
import { ProjectNotFoundError } from "../services/errors.ts"
import {
  runTestCommand,
  runTestCommandExpectError,
  mockProject,
} from "../testing/index.ts"
import {
  computeWorktreePath,
  createWorktreeHandler,
  listWorktreesHandler,
  deleteWorktreeHandler,
  openWorktreeHandler,
  pruneWorktreesHandler,
} from "./worktree.ts"

describe("worktree create", () => {
  test("creates worktree with explicit name", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    const logs = await runTestCommand(
      createWorktreeHandler({
        project: "my-project",
        name: Option.some("feature-branch"),
        from: Option.none(),
        open: false,
        editor: Option.none(),
      }),
      { project: { initialProjects: [project] } }
    )

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("creates worktree with auto-generated name", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    const logs = await runTestCommand(
      createWorktreeHandler({
        project: "my-project",
        name: Option.none(), // Test auto-generation
        from: Option.none(),
        open: false,
        editor: Option.none(),
      }),
      { project: { initialProjects: [project] } }
    )

    // Verify the output contains expected patterns (name will be auto-generated)
    expect(logs.some(l => l.includes("Creating worktree"))).toBe(true)
    expect(logs.some(l => l.includes("for project 'my-project'"))).toBe(true)
    expect(logs.some(l => l.includes("Worktree created successfully"))).toBe(true)
  })

  test("creates worktree from specific ref", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    const logs = await runTestCommand(
      createWorktreeHandler({
        project: "my-project",
        name: Option.some("hotfix"),
        from: Option.some("v1.0.0"),
        open: false,
        editor: Option.none(),
      }),
      { project: { initialProjects: [project] } }
    )

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("fails for non-existent project", async () => {
    const error = await runTestCommandExpectError(
      createWorktreeHandler({
        project: "unknown-project",
        name: Option.some("feature-branch"),
        from: Option.none(),
        open: false,
        editor: Option.none(),
      }),
      { project: { initialProjects: [] } }
    )

    expect(error).toBeInstanceOf(ProjectNotFoundError)
    expect((error as ProjectNotFoundError).name).toBe("unknown-project")
  })
})

describe("worktree list", () => {
  test("lists worktrees for a project", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath1 = computeWorktreePath("my-project", "feature-a")
    const worktreePath2 = computeWorktreePath("my-project", "feature-b")

    const logs = await runTestCommand(
      listWorktreesHandler({ project: "my-project" }),
      {
        project: { initialProjects: [project] },
        worktree: {
          initialWorktrees: new Map([
            [worktreePath1, { path: worktreePath1, branch: "feature-a", commit: "abc1234", isMain: false }],
            [worktreePath2, { path: worktreePath2, branch: "feature-b", commit: "def5678", isMain: false }],
          ]),
        },
      }
    )

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("shows empty message when no worktrees", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    const logs = await runTestCommand(
      listWorktreesHandler({ project: "my-project" }),
      {
        project: { initialProjects: [project] },
        worktree: { initialWorktrees: new Map() },
      }
    )

    expect(logs.join("\n")).toMatchSnapshot()
  })
})

describe("worktree delete", () => {
  test("deletes a worktree", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "old-branch")

    const logs = await runTestCommand(
      deleteWorktreeHandler({
        project: "my-project",
        name: "old-branch",
        force: false,
      }),
      {
        project: { initialProjects: [project] },
        worktree: {
          initialWorktrees: new Map([
            [worktreePath, { path: worktreePath, branch: "old-branch", commit: "xyz9999", isMain: false }],
          ]),
        },
      }
    )

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("force deletes a worktree", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "dirty-branch")

    const logs = await runTestCommand(
      deleteWorktreeHandler({
        project: "my-project",
        name: "dirty-branch",
        force: true,
      }),
      {
        project: { initialProjects: [project] },
        worktree: {
          initialWorktrees: new Map([
            [worktreePath, { path: worktreePath, branch: "dirty-branch", commit: "xyz9999", isMain: false }],
          ]),
        },
      }
    )

    expect(logs.join("\n")).toMatchSnapshot()
  })

  test("fails for non-existent worktree", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "nonexistent")

    const error = await runTestCommandExpectError(
      deleteWorktreeHandler({
        project: "my-project",
        name: "nonexistent",
        force: false,
      }),
      {
        project: { initialProjects: [project] },
        worktree: { initialWorktrees: new Map() },
      }
    )

    expect(error).toBeInstanceOf(WorktreeNotFoundError)
    expect((error as WorktreeNotFoundError).path).toBe(worktreePath)
  })
})

describe("worktree prune", () => {
  test("prunes stale worktrees", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    const logs = await runTestCommand(
      pruneWorktreesHandler({ project: "my-project" }),
      { project: { initialProjects: [project] } }
    )

    expect(logs.join("\n")).toMatchSnapshot()
  })
})

describe("worktree open", () => {
  // Note: We skip the Bun.$ execution in tests by not mocking it
  // The test verifies the flow up to the shell command

  test("validates worktree exists before opening", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })
    const worktreePath = computeWorktreePath("my-project", "nonexistent")

    const error = await runTestCommandExpectError(
      openWorktreeHandler({
        project: "my-project",
        name: Option.some("nonexistent"),
        editor: Option.none(),
      }),
      {
        project: { initialProjects: [project] },
        worktree: { initialWorktrees: new Map() },
      }
    )

    expect(error).toBeInstanceOf(WorktreeNotFoundError)
  })

  test("fails when name is not provided", async () => {
    const project = mockProject({ name: "my-project", gitPath: "/path/to/repo" })

    await expect(
      runTestCommand(
        openWorktreeHandler({
          project: "my-project",
          name: Option.none(), // Missing required name
          editor: Option.none(),
        }),
        { project: { initialProjects: [project] } }
      )
    ).rejects.toThrow("Worktree name is required")
  })
})
