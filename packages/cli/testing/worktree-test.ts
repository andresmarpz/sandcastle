import { Effect, Layer, Ref } from "effect"
import {
  WorktreeService,
  WorktreeNotFoundError,
  WorktreeExistsError,
  BranchExistsError,
  type WorktreeInfo,
  type CreateWorktreeOptions,
  type RemoveWorktreeOptions,
} from "@sandcastle/worktree"

export interface WorktreeServiceTestConfig {
  /** Initial worktrees to seed (keyed by worktreePath) */
  initialWorktrees?: Map<string, WorktreeInfo>
  /** Branches that already exist (will fail createBranch) */
  existingBranches?: Set<string>
}

/**
 * Creates a test layer for WorktreeService with in-memory storage.
 */
export const makeWorktreeServiceTest = (config: WorktreeServiceTestConfig = {}) => {
  const { initialWorktrees = new Map(), existingBranches = new Set() } = config

  return Layer.effect(
    WorktreeService,
    Effect.gen(function* () {
      const worktreesRef = yield* Ref.make<Map<string, WorktreeInfo>>(new Map(initialWorktrees))
      const branchesRef = yield* Ref.make<Set<string>>(new Set(existingBranches))

      return {
        create: (options: CreateWorktreeOptions) =>
          Effect.gen(function* () {
            const worktrees = yield* Ref.get(worktreesRef)
            const branches = yield* Ref.get(branchesRef)

            // Check if worktree already exists
            if (worktrees.has(options.worktreePath)) {
              return yield* Effect.fail(new WorktreeExistsError({ path: options.worktreePath }))
            }

            // Check if branch already exists when trying to create a new one
            if (options.createBranch && branches.has(options.branch)) {
              return yield* Effect.fail(new BranchExistsError({ branch: options.branch }))
            }

            const info: WorktreeInfo = {
              path: options.worktreePath,
              branch: options.branch,
              commit: "abc1234", // Mock commit hash
              isMain: false,
            }

            yield* Ref.update(worktreesRef, (map) => new Map(map).set(options.worktreePath, info))
            yield* Ref.update(branchesRef, (set) => new Set(set).add(options.branch))

            return info
          }),

        list: (repoPath: string) =>
          Effect.gen(function* () {
            const worktrees = yield* Ref.get(worktreesRef)
            // Filter by repoPath prefix (in tests, we just return all for simplicity)
            return Array.from(worktrees.values())
          }),

        remove: (options: RemoveWorktreeOptions) =>
          Effect.gen(function* () {
            const worktrees = yield* Ref.get(worktreesRef)

            if (!worktrees.has(options.worktreePath)) {
              return yield* Effect.fail(new WorktreeNotFoundError({ path: options.worktreePath }))
            }

            yield* Ref.update(worktreesRef, (map) => {
              const newMap = new Map(map)
              newMap.delete(options.worktreePath)
              return newMap
            })
          }),

        get: (repoPath: string, worktreePath: string) =>
          Effect.gen(function* () {
            const worktrees = yield* Ref.get(worktreesRef)
            const info = worktrees.get(worktreePath)

            if (!info) {
              return yield* Effect.fail(new WorktreeNotFoundError({ path: worktreePath }))
            }

            return info
          }),

        prune: (repoPath: string) =>
          Effect.gen(function* () {
            // Prune is a no-op in tests - just succeeds
          }),
      }
    })
  )
}

/**
 * Default test layer with no initial worktrees
 */
export const WorktreeServiceTest = makeWorktreeServiceTest()
