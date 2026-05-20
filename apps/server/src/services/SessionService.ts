import { Context, Effect, Layer } from "effect"

import {
  AbsolutePath,
  InternalError,
  SessionId,
  SessionNotFound,
  WorkspaceId,
  WorkspaceNotFound,
  WorkspaceNotGit,
  WorktreeCreateFailed,
  type Session as SessionWire,
  type SessionStatus,
  type WorktreeMode,
} from "@sandcastle/contracts"
import type { Session as SessionEntity, WorktreeMode as WorktreeModeEntity } from "@sandcastle/entities"
import { Sessions as SessionsRepo, Workspaces as WorkspacesRepo, type SqliteError } from "@sandcastle/db"

import { newSessionId } from "../lib/ids.ts"

const toInternal = (cause: unknown): InternalError =>
  new InternalError({ message: cause instanceof Error ? cause.message : String(cause) })

const toWire = (s: SessionEntity): SessionWire => ({
  id: SessionId.make(s.id),
  workspaceId: WorkspaceId.make(s.workspaceId),
  title: s.title,
  worktreeMode:
    s.worktreeMode.kind === "local"
      ? { _tag: "local" }
      : { _tag: "worktree", baseBranch: s.worktreeMode.baseBranch },
  workdir: AbsolutePath.make(s.workdir),
  branch: s.branch,
  status: s.status as SessionStatus,
  createdAt: s.createdAt as unknown as SessionWire["createdAt"],
  updatedAt: s.updatedAt as unknown as SessionWire["updatedAt"],
})

const toEntityWorktreeMode = (mode: WorktreeMode): WorktreeModeEntity => {
  if (mode._tag === "local") return { kind: "local" }
  // worktreeBranch is assigned when we actually create the worktree;
  // until the PTY/worktree layer lands we never reach this branch.
  return { kind: "worktree", baseBranch: mode.baseBranch, worktreeBranch: "" }
}

export interface SessionServiceShape {
  readonly create: (input: {
    readonly workspaceId: WorkspaceId
    readonly title?: string
    readonly worktreeMode: WorktreeMode
  }) => Effect.Effect<
    SessionWire,
    WorkspaceNotFound | WorkspaceNotGit | WorktreeCreateFailed | InternalError
  >
  readonly list: (input: {
    readonly workspaceId?: WorkspaceId
  }) => Effect.Effect<ReadonlyArray<SessionWire>, InternalError>
  readonly get: (
    sessionId: SessionId,
  ) => Effect.Effect<SessionWire, SessionNotFound | InternalError>
  readonly delete: (
    sessionId: SessionId,
  ) => Effect.Effect<void, SessionNotFound | InternalError>
}

export class SessionService extends Context.Service<SessionService, SessionServiceShape>()(
  "@sandcastle/server/SessionService",
) {}

export const layer: Layer.Layer<SessionService, never, WorkspacesRepo | SessionsRepo> = Layer.effect(
  SessionService,
)(
  Effect.gen(function* () {
    const workspaces = yield* WorkspacesRepo
    const sessions = yield* SessionsRepo

    const create: SessionServiceShape["create"] = (input) =>
      Effect.gen(function* () {
        const workspace = yield* workspaces
          .getById(input.workspaceId as unknown as Parameters<typeof workspaces.getById>[0])
          .pipe(Effect.mapError(toInternal))
        if (workspace === null) {
          return yield* Effect.fail(
            new WorkspaceNotFound({ workspaceId: input.workspaceId as string }),
          )
        }

        if (input.worktreeMode._tag === "worktree" && !workspace.isGit) {
          return yield* Effect.fail(
            new WorkspaceNotGit({ workspaceId: input.workspaceId as string }),
          )
        }

        if (input.worktreeMode._tag === "worktree") {
          // Worktree creation lands with the PTY layer.
          return yield* Effect.fail(
            new WorktreeCreateFailed({
              message: "worktree mode is not implemented yet",
            }),
          )
        }

        const sessionId = newSessionId()
        const workdir = workspace.path as unknown as string

        const row = yield* sessions
          .create({
            id: sessionId as unknown as Parameters<typeof sessions.create>[0]["id"],
            workspaceId: input.workspaceId as unknown as Parameters<
              typeof sessions.create
            >[0]["workspaceId"],
            title: input.title?.trim() || "Untitled session",
            worktreeMode: toEntityWorktreeMode(input.worktreeMode),
            workdir: AbsolutePath.make(workdir) as unknown as Parameters<
              typeof sessions.create
            >[0]["workdir"],
            branch: null,
          })
          .pipe(Effect.mapError(toInternal))

        return toWire(row)
      })

    const list: SessionServiceShape["list"] = (input) =>
      sessions
        .list(
          input.workspaceId === undefined
            ? undefined
            : { workspaceId: input.workspaceId as unknown as WorkspaceId },
        )
        .pipe(
          Effect.mapError(toInternal),
          Effect.map((rows) => rows.map(toWire)),
        )

    const get: SessionServiceShape["get"] = (sessionId) =>
      sessions
        .getById(sessionId as unknown as Parameters<typeof sessions.getById>[0])
        .pipe(
          Effect.mapError(toInternal),
          Effect.flatMap((row) =>
            row === null
              ? Effect.fail(new SessionNotFound({ sessionId: sessionId as string }))
              : Effect.succeed(toWire(row)),
          ),
        )

    const del: SessionServiceShape["delete"] = (sessionId) =>
      sessions
        .softDelete(sessionId as unknown as Parameters<typeof sessions.softDelete>[0])
        .pipe(
          Effect.catchTag("SessionNotFound", (e: { sessionId: string }) =>
            Effect.fail(new SessionNotFound({ sessionId: e.sessionId })),
          ),
          Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
        )

    return SessionService.of({ create, list, get, delete: del })
  }),
)
