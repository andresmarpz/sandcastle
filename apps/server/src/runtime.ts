import { Migrations, projectsLayer, sqliteLayer, workspacesLayer } from "@sandcastle/db";
import { Effect, Layer } from "effect";

import { layer as ConfigLive, ServerConfig } from "./config/ConfigService.ts";
import { HttpLive } from "./http/server.ts";
import { ensureDir } from "./lib/paths.ts";
import { layer as ProjectServiceLive } from "./services/ProjectService.ts";
import { layer as WorkspaceServiceLive } from "./services/WorkspaceService.ts";

const SqliteLive = Layer.unwrap(
	Effect.gen(function* () {
		const config = yield* ServerConfig;
		yield* ensureDir(config.rootDir).pipe(Effect.orDie);
		yield* ensureDir(config.worktreesDir).pipe(Effect.orDie);
		return sqliteLayer(config.dbPath);
	}),
);

const MigrationsLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const migrationsDir = new URL("../../../packages/db/migrations", import.meta.url).pathname;
		const migrations = yield* Migrations.loadFromDir(migrationsDir);
		yield* Migrations.apply(migrations).pipe(Effect.orDie);
	}),
);

const RepoLive = Layer.mergeAll(projectsLayer, workspacesLayer);

export const ServerLive = HttpLive.pipe(
	Layer.provideMerge(ProjectServiceLive),
	Layer.provideMerge(WorkspaceServiceLive),
	Layer.provideMerge(RepoLive),
	Layer.provideMerge(MigrationsLive),
	Layer.provideMerge(SqliteLive),
	Layer.provideMerge(ConfigLive),
);
