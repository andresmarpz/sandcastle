import { homedir } from "node:os";
import { join } from "node:path";
import { Config, Context, Effect, Layer, Option } from "effect";

/**
 * Effective server configuration. Loaded from environment variables; the
 * full `~/.sandcastle/config.json` overlay (`architecture.md` §6.7) lands
 * with the MCP slice.
 */

export interface ServerConfigData {
	readonly host: string;
	readonly port: number;
	readonly rootDir: string;
	readonly dbPath: string;
	readonly worktreesDir: string;
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigData>()(
	"@sandcastle/server/ServerConfig",
) {}

export const layer: Layer.Layer<ServerConfig, Config.ConfigError> = Layer.effect(ServerConfig)(
	Effect.gen(function* () {
		const host = yield* Config.string("HOST").pipe(Config.withDefault("127.0.0.1"));
		const port = yield* Config.int("PORT").pipe(Config.withDefault(7421));

		const rootDirOpt = yield* Config.string("SANDCASTLE_HOME").pipe(Config.option);
		const rootDir = Option.isSome(rootDirOpt) ? rootDirOpt.value : join(homedir(), ".sandcastle");

		const dbPath = join(rootDir, "sandcastle.db");
		const worktreesDir = join(rootDir, "worktrees");

		return ServerConfig.of({
			host,
			port,
			rootDir,
			dbPath,
			worktreesDir,
		});
	}),
);
