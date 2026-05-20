import { Effect, Layer } from "effect"

import {
  Migrations,
  blobsLayer,
  sessionsLayer,
  sqliteLayer,
  workspacesLayer,
} from "@sandcastle/db"

import { ServerConfig, layer as ConfigLive } from "./config/ConfigService.ts"
import { layer as WorkspaceServiceLive } from "./services/WorkspaceService.ts"
import { layer as SessionServiceLive } from "./services/SessionService.ts"
import { ensureDir } from "./lib/paths.ts"
import { HttpLive } from "./http/server.ts"

const SqliteLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    yield* ensureDir(config.rootDir).pipe(Effect.orDie)
    yield* ensureDir(config.blobsDir).pipe(Effect.orDie)
    yield* ensureDir(config.worktreesDir).pipe(Effect.orDie)
    return sqliteLayer(config.dbPath)
  }),
)

const MigrationsLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const migrationsDir = new URL("../../../packages/db/migrations", import.meta.url).pathname
    const migrations = yield* Migrations.loadFromDir(migrationsDir)
    yield* Migrations.apply(migrations).pipe(Effect.orDie)
  }),
)

const RepoLive = Layer.mergeAll(workspacesLayer, sessionsLayer, blobsLayer)

export const ServerLive = HttpLive.pipe(
  Layer.provideMerge(WorkspaceServiceLive),
  Layer.provideMerge(SessionServiceLive),
  Layer.provideMerge(RepoLive),
  Layer.provideMerge(MigrationsLive),
  Layer.provideMerge(SqliteLive),
  Layer.provideMerge(ConfigLive),
)
