import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Migrations, projectsLayer, sqliteLayer, workspacesLayer } from "@sandcastle/db";
import { Effect, Layer, ManagedRuntime } from "effect";

import { ServerConfig } from "../src/config/ConfigService.ts";
import { ensureDir } from "../src/lib/paths.ts";
import { layer as ProjectServiceLive, ProjectService } from "../src/services/ProjectService.ts";
import { layer as WorkspaceServiceLive, WorkspaceService } from "../src/services/WorkspaceService.ts";

/**
 * One harness per test: temp `~/.sandcastle` under `os.tmpdir()`, a fresh
 * SQLite database, both services live. No mocks — real layers all the way
 * down to git CLI and bun:sqlite.
 */
export interface TestHarness {
	readonly home: string;
	readonly worktreesDir: string;
	readonly runtime: ManagedRuntime.ManagedRuntime<ProjectService | WorkspaceService, never>;
	readonly dispose: () => Promise<void>;
}

export const makeHarness = (): TestHarness => {
	const home = mkdtempSync(join(tmpdir(), "sandcastle-test-"));
	const worktreesDir = join(home, "worktrees");

	const ConfigTest = Layer.succeed(
		ServerConfig,
		ServerConfig.of({
			host: "127.0.0.1",
			port: 0,
			rootDir: home,
			dbPath: join(home, "sandcastle.db"),
			worktreesDir,
		}),
	);

	const SqliteTest = Layer.unwrap(
		Effect.gen(function* () {
			const config = yield* ServerConfig;
			yield* ensureDir(config.rootDir).pipe(Effect.orDie);
			yield* ensureDir(config.worktreesDir).pipe(Effect.orDie);
			return sqliteLayer(config.dbPath);
		}),
	);

	const MigrationsTest = Layer.effectDiscard(
		Effect.gen(function* () {
			const migrationsDir = new URL("../../../packages/db/migrations/", import.meta.url).pathname;
			const migrations = yield* Migrations.loadFromDir(migrationsDir);
			yield* Migrations.apply(migrations).pipe(Effect.orDie);
		}),
	);

	const RepoTest = Layer.mergeAll(projectsLayer, workspacesLayer);

	const TestLive = Layer.mergeAll(ProjectServiceLive, WorkspaceServiceLive).pipe(
		Layer.provideMerge(RepoTest),
		Layer.provideMerge(MigrationsTest),
		Layer.provideMerge(SqliteTest),
		Layer.provideMerge(ConfigTest),
	);

	const runtime = ManagedRuntime.make(TestLive);

	const dispose = async () => {
		await runtime.dispose();
		await rm(home, { recursive: true, force: true });
	};

	return { home, worktreesDir, runtime, dispose };
};

/**
 * Initializes a git repo at `path` with one empty commit on `main` so
 * `git rev-parse HEAD` succeeds (the worktree path branches off HEAD).
 */
export const initGitRepo = async (path: string): Promise<void> => {
	const gitEnv = {
		...process.env,
		GIT_AUTHOR_NAME: "Test",
		GIT_AUTHOR_EMAIL: "test@example.com",
		GIT_COMMITTER_NAME: "Test",
		GIT_COMMITTER_EMAIL: "test@example.com",
	};
	const run = async (args: ReadonlyArray<string>) => {
		const proc = Bun.spawn(args as string[], {
			env: gitEnv,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
		if (code !== 0) {
			throw new Error(`${args.join(" ")} failed (${code}): ${stderr}`);
		}
	};

	await run(["git", "init", "-b", "main", path]);
	await run(["git", "-C", path, "config", "user.email", "test@example.com"]);
	await run(["git", "-C", path, "config", "user.name", "Test"]);
	await run(["git", "-C", path, "commit", "--allow-empty", "-m", "initial"]);
};

export const makeTempDir = (prefix = "sandcastle-test-tmp-"): string =>
	mkdtempSync(join(tmpdir(), prefix));
