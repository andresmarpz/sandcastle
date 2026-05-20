import {
  type AbsolutePath,
  type IsoDateTime,
  type Workspace,
  type WorkspaceId,
} from "@sandcastle/entities"
import { Context, Effect, Layer } from "effect"
import { Sqlite } from "../client.ts"
import {
  SqliteError,
  WorkspaceNotFound,
  WorkspacePathConflict,
} from "../errors.ts"

interface WorkspaceRow {
  readonly id: string
  readonly label: string
  readonly path: string
  readonly is_git: number
  readonly created_at: string
  readonly updated_at: string
  readonly deleted_at: string | null
}

const decodeRow = (row: WorkspaceRow): Workspace => ({
  id: row.id as WorkspaceId,
  label: row.label,
  path: row.path as AbsolutePath,
  isGit: row.is_git !== 0,
  createdAt: row.created_at as IsoDateTime,
  updatedAt: row.updated_at as IsoDateTime,
  deletedAt: (row.deleted_at ?? null) as IsoDateTime | null,
})

export interface CreateWorkspaceInput {
  readonly id: WorkspaceId
  readonly label: string
  readonly path: AbsolutePath
  readonly isGit: boolean
}

export class Workspaces extends Context.Service<
  Workspaces,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<Workspace>, SqliteError>
    readonly getById: (
      id: WorkspaceId,
    ) => Effect.Effect<Workspace | null, SqliteError>
    readonly getActiveByPath: (
      path: AbsolutePath,
    ) => Effect.Effect<Workspace | null, SqliteError>
    readonly create: (
      input: CreateWorkspaceInput,
    ) => Effect.Effect<Workspace, SqliteError | WorkspacePathConflict>
    readonly rename: (
      id: WorkspaceId,
      label: string,
    ) => Effect.Effect<Workspace, SqliteError | WorkspaceNotFound>
    readonly softDelete: (
      id: WorkspaceId,
    ) => Effect.Effect<void, SqliteError | WorkspaceNotFound>
  }
>()("@sandcastle/db/Workspaces") {}

export const layer: Layer.Layer<Workspaces, never, Sqlite> = Layer.effect(
  Workspaces,
)(
  Effect.gen(function* () {
    const sqlite = yield* Sqlite

    const list = () =>
      sqlite
        .query<WorkspaceRow>(
          "SELECT id, label, path, is_git, created_at, updated_at, deleted_at FROM workspaces WHERE deleted_at IS NULL ORDER BY created_at ASC",
        )
        .pipe(Effect.map((rows) => rows.map(decodeRow)))

    const getById = (id: WorkspaceId) =>
      sqlite
        .queryOne<WorkspaceRow>(
          "SELECT id, label, path, is_git, created_at, updated_at, deleted_at FROM workspaces WHERE id = ?",
          [id as string],
        )
        .pipe(Effect.map((row) => (row === null ? null : decodeRow(row))))

    const getActiveByPath = (path: AbsolutePath) =>
      sqlite
        .queryOne<WorkspaceRow>(
          "SELECT id, label, path, is_git, created_at, updated_at, deleted_at FROM workspaces WHERE path = ? AND deleted_at IS NULL",
          [path as string],
        )
        .pipe(Effect.map((row) => (row === null ? null : decodeRow(row))))

    const create = (input: CreateWorkspaceInput) =>
      Effect.gen(function* () {
        const existing = yield* getActiveByPath(input.path)
        if (existing !== null) {
          return yield* Effect.fail(
            new WorkspacePathConflict({ path: input.path as string }),
          )
        }
        const now = new Date().toISOString()
        yield* sqlite.run(
          "INSERT INTO workspaces (id, label, path, is_git, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
          [
            input.id as string,
            input.label,
            input.path as string,
            input.isGit ? 1 : 0,
            now,
            now,
          ],
        )
        return decodeRow({
          id: input.id as string,
          label: input.label,
          path: input.path as string,
          is_git: input.isGit ? 1 : 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })
      })

    const rename = (id: WorkspaceId, label: string) =>
      Effect.gen(function* () {
        const now = new Date().toISOString()
        const result = yield* sqlite.run(
          "UPDATE workspaces SET label = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
          [label, now, id as string],
        )
        if (result.changes === 0) {
          return yield* Effect.fail(
            new WorkspaceNotFound({ workspaceId: id as string }),
          )
        }
        const row = yield* getById(id)
        if (row === null) {
          return yield* Effect.fail(
            new WorkspaceNotFound({ workspaceId: id as string }),
          )
        }
        return row
      })

    const softDelete = (id: WorkspaceId) =>
      Effect.gen(function* () {
        const now = new Date().toISOString()
        const result = yield* sqlite.run(
          "UPDATE workspaces SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
          [now, now, id as string],
        )
        if (result.changes === 0) {
          return yield* Effect.fail(
            new WorkspaceNotFound({ workspaceId: id as string }),
          )
        }
      })

    return Workspaces.of({
      list,
      getById,
      getActiveByPath,
      create,
      rename,
      softDelete,
    })
  }),
)
