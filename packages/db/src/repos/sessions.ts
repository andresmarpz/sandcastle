import {
  type AbsolutePath,
  type IsoDateTime,
  type Session,
  type SessionId,
  type SessionStatus,
  type WorkspaceId,
  type WorktreeMode,
} from "@sandcastle/entities"
import { Context, Effect, Layer } from "effect"
import { Sqlite } from "../client.ts"
import { SessionNotFound, type SqliteError } from "../errors.ts"

interface SessionRow {
  readonly id: string
  readonly workspace_id: string
  readonly title: string
  readonly worktree_mode_json: string
  readonly workdir: string
  readonly branch: string | null
  readonly status: string
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
}

const COLUMNS =
  "id, workspace_id, title, worktree_mode_json, workdir, branch, status, created_at, updated_at, deleted_at"

const decodeRow = (row: SessionRow): Session => ({
  id: row.id as SessionId,
  workspaceId: row.workspace_id as WorkspaceId,
  title: row.title,
  worktreeMode: JSON.parse(row.worktree_mode_json) as WorktreeMode,
  workdir: row.workdir as AbsolutePath,
  branch: row.branch,
  status: row.status as SessionStatus,
  createdAt: row.created_at as IsoDateTime,
  updatedAt: row.updated_at as IsoDateTime,
  deletedAt: (row.deleted_at ?? null) as IsoDateTime | null,
})

export interface CreateSessionInput {
  readonly id: SessionId
  readonly workspaceId: WorkspaceId
  readonly title: string
  readonly worktreeMode: WorktreeMode
  readonly workdir: AbsolutePath
  readonly branch: string | null
}

export interface SessionPatch {
  readonly title?: string
  readonly status?: SessionStatus
  readonly branch?: string | null
}

export class Sessions extends Context.Service<
  Sessions,
  {
    readonly list: (filter?: {
      readonly workspaceId?: WorkspaceId
    }) => Effect.Effect<ReadonlyArray<Session>, SqliteError>
    readonly getById: (id: SessionId) => Effect.Effect<Session | null, SqliteError>
    readonly create: (input: CreateSessionInput) => Effect.Effect<Session, SqliteError>
    readonly patch: (
      id: SessionId,
      patch: SessionPatch,
    ) => Effect.Effect<Session, SqliteError | SessionNotFound>
    readonly softDelete: (id: SessionId) => Effect.Effect<void, SqliteError | SessionNotFound>
  }
>()("@sandcastle/db/Sessions") {}

export const layer: Layer.Layer<Sessions, never, Sqlite> = Layer.effect(Sessions)(
  Effect.gen(function* () {
    const sqlite = yield* Sqlite

    const list = (filter?: { readonly workspaceId?: WorkspaceId }) => {
      if (filter?.workspaceId !== undefined) {
        return sqlite
          .query<SessionRow>(
            `SELECT ${COLUMNS} FROM sessions WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
            [filter.workspaceId as string],
          )
          .pipe(Effect.map((rows) => rows.map(decodeRow)))
      }
      return sqlite
        .query<SessionRow>(
          `SELECT ${COLUMNS} FROM sessions WHERE deleted_at IS NULL ORDER BY created_at DESC`,
        )
        .pipe(Effect.map((rows) => rows.map(decodeRow)))
    }

    const getById = (id: SessionId) =>
      sqlite
        .queryOne<SessionRow>(`SELECT ${COLUMNS} FROM sessions WHERE id = ?`, [id as string])
        .pipe(Effect.map((row) => (row === null ? null : decodeRow(row))))

    const create = (input: CreateSessionInput) =>
      Effect.gen(function* () {
        const now = new Date().toISOString()
        yield* sqlite.run(
          `INSERT INTO sessions (id, workspace_id, title, worktree_mode_json, workdir, branch, status, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?, NULL)`,
          [
            input.id as string,
            input.workspaceId as string,
            input.title,
            JSON.stringify(input.worktreeMode),
            input.workdir as string,
            input.branch,
            now,
            now,
          ],
        )
        const row = yield* getById(input.id)
        if (row === null) {
          return yield* Effect.die(new Error(`Session ${input.id} disappeared after insert`))
        }
        return row
      })

    const patch = (id: SessionId, p: SessionPatch) =>
      Effect.gen(function* () {
        const sets: Array<string> = []
        const params: Array<string | number | null> = []

        if (p.title !== undefined) {
          sets.push("title = ?")
          params.push(p.title)
        }
        if (p.status !== undefined) {
          sets.push("status = ?")
          params.push(p.status)
        }
        if (p.branch !== undefined) {
          sets.push("branch = ?")
          params.push(p.branch)
        }

        const now = new Date().toISOString()
        sets.push("updated_at = ?")
        params.push(now)
        params.push(id as string)

        const result = yield* sqlite.run(
          `UPDATE sessions SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params,
        )
        if (result.changes === 0) {
          return yield* Effect.fail(new SessionNotFound({ sessionId: id as string }))
        }
        const row = yield* getById(id)
        if (row === null) {
          return yield* Effect.fail(new SessionNotFound({ sessionId: id as string }))
        }
        return row
      })

    const softDelete = (id: SessionId) =>
      Effect.gen(function* () {
        const now = new Date().toISOString()
        const result = yield* sqlite.run(
          "UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
          [now, now, id as string],
        )
        if (result.changes === 0) {
          return yield* Effect.fail(new SessionNotFound({ sessionId: id as string }))
        }
      })

    return Sessions.of({ list, getById, create, patch, softDelete })
  }),
)
