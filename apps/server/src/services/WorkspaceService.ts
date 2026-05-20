import { Context, Effect, Layer } from "effect"

import {
  AbsolutePath,
  InternalError,
  IsoDateTime,
  type Workspace as WorkspaceWire,
  WorkspaceId,
  WorkspaceNotFound,
  WorkspacePathConflict,
  WorkspacePathInvalid,
  WorkspacePathNotFound,
} from "@sandcastle/contracts"
import {
  Workspaces as WorkspacesRepo,
  WorkspacePathConflict as WorkspacePathConflictDb,
  type SqliteError,
} from "@sandcastle/db"
import type { Workspace as WorkspaceEntity } from "@sandcastle/entities"

import { newWorkspaceId } from "../lib/ids.ts"
import { isAbsolutePath, pathStat } from "../lib/paths.ts"

const toInternal = (cause: unknown): InternalError =>
  new InternalError({ message: cause instanceof Error ? cause.message : String(cause) })

const toWire = (w: WorkspaceEntity): WorkspaceWire => ({
  id: WorkspaceId.make(w.id),
  label: w.label,
  path: AbsolutePath.make(w.path),
  isGit: w.isGit,
  createdAt: IsoDateTime.make(w.createdAt),
  updatedAt: IsoDateTime.make(w.updatedAt),
})

const probeIsGit = (path: string): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["git", "-C", path, "rev-parse", "--is-inside-work-tree"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const code = await proc.exited
      return code === 0
    },
    catch: () => false,
  }).pipe(Effect.catch(() => Effect.succeed(false)))

export interface WorkspaceServiceShape {
  readonly create: (input: {
    readonly label: string
    readonly path: string
  }) => Effect.Effect<
    WorkspaceWire,
    WorkspacePathInvalid | WorkspacePathNotFound | WorkspacePathConflict | InternalError
  >
  readonly list: () => Effect.Effect<ReadonlyArray<WorkspaceWire>, InternalError>
  readonly get: (
    workspaceId: WorkspaceId,
  ) => Effect.Effect<WorkspaceWire, WorkspaceNotFound | InternalError>
  readonly delete: (
    workspaceId: WorkspaceId,
  ) => Effect.Effect<void, WorkspaceNotFound | InternalError>
}

export class WorkspaceService extends Context.Service<WorkspaceService, WorkspaceServiceShape>()(
  "@sandcastle/server/WorkspaceService",
) {}

export const layer: Layer.Layer<WorkspaceService, never, WorkspacesRepo> = Layer.effect(
  WorkspaceService,
)(
  Effect.gen(function* () {
    const repo = yield* WorkspacesRepo

    const create: WorkspaceServiceShape["create"] = (input) =>
      Effect.gen(function* () {
        if (!isAbsolutePath(input.path)) {
          return yield* Effect.fail(
            new WorkspacePathInvalid({ path: input.path, reason: "path must be absolute" }),
          )
        }
        const stat = yield* pathStat(input.path)
        if (!stat.exists) {
          return yield* Effect.fail(new WorkspacePathNotFound({ path: input.path }))
        }
        if (!stat.isDirectory) {
          return yield* Effect.fail(
            new WorkspacePathInvalid({ path: input.path, reason: "path is not a directory" }),
          )
        }

        const isGit = yield* probeIsGit(input.path)
        const id = newWorkspaceId()

        const created = yield* repo
          .create({
            id: id as unknown as Parameters<typeof repo.create>[0]["id"],
            label: input.label,
            path: AbsolutePath.make(input.path) as unknown as Parameters<
              typeof repo.create
            >[0]["path"],
            isGit,
          })
          .pipe(
            Effect.catchTag("WorkspacePathConflict", (err: WorkspacePathConflictDb) =>
              Effect.fail(new WorkspacePathConflict({ path: err.path })),
            ),
            Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
          )

        return toWire(created)
      })

    const list: WorkspaceServiceShape["list"] = () =>
      repo.list().pipe(
        Effect.mapError(toInternal),
        Effect.map((rows) => rows.map(toWire)),
      )

    const get: WorkspaceServiceShape["get"] = (workspaceId) =>
      repo
        .getById(workspaceId as unknown as Parameters<typeof repo.getById>[0])
        .pipe(
          Effect.mapError(toInternal),
          Effect.flatMap((row) =>
            row === null
              ? Effect.fail(new WorkspaceNotFound({ workspaceId: workspaceId as string }))
              : Effect.succeed(toWire(row)),
          ),
        )

    const del: WorkspaceServiceShape["delete"] = (workspaceId) =>
      repo
        .softDelete(workspaceId as unknown as Parameters<typeof repo.softDelete>[0])
        .pipe(
          Effect.catchTag("WorkspaceNotFound", (e: { workspaceId: string }) =>
            Effect.fail(new WorkspaceNotFound({ workspaceId: e.workspaceId })),
          ),
          Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
        )

    return WorkspaceService.of({ create, list, get, delete: del })
  }),
)
