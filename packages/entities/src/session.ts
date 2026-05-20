import type { SessionId, WorkspaceId } from "./ids.ts"
import type { AbsolutePath } from "./paths.ts"
import type { IsoDateTime } from "./time.ts"

export type WorktreeMode =
  | { readonly kind: "local" }
  | {
      readonly kind: "worktree"
      readonly baseBranch: string | null
      readonly worktreeBranch: string
    }

export type SessionStatus = "idle" | "running" | "exited"

export interface Session {
  readonly id: SessionId
  readonly workspaceId: WorkspaceId
  readonly title: string
  readonly worktreeMode: WorktreeMode
  readonly workdir: AbsolutePath
  readonly branch: string | null
  readonly status: SessionStatus
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly deletedAt: IsoDateTime | null
}

export interface NewSessionConfig {
  readonly workspaceId: WorkspaceId
  readonly title?: string
  readonly worktreeMode: WorktreeMode
}
