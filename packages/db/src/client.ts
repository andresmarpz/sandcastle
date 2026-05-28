import { Database } from "bun:sqlite";
import { Context, Effect, Exit, Layer, Semaphore } from "effect";
import { SqliteError } from "./errors.ts";

export type SqliteValue = string | number | boolean | bigint | null | Uint8Array;

export interface RunResult {
	readonly changes: number;
	readonly lastInsertRowid: number | bigint;
}

export class Sqlite extends Context.Service<
	Sqlite,
	{
		readonly query: <T>(
			sql: string,
			params?: ReadonlyArray<SqliteValue>,
		) => Effect.Effect<ReadonlyArray<T>, SqliteError>;
		readonly queryOne: <T>(
			sql: string,
			params?: ReadonlyArray<SqliteValue>,
		) => Effect.Effect<T | null, SqliteError>;
		readonly run: (
			sql: string,
			params?: ReadonlyArray<SqliteValue>,
		) => Effect.Effect<RunResult, SqliteError>;
		readonly exec: (sql: string) => Effect.Effect<void, SqliteError>;
		readonly withTransaction: <A, E, R>(
			eff: Effect.Effect<A, E, R>,
		) => Effect.Effect<A, E | SqliteError, R>;
		readonly raw: Database;
	}
>()("@sandcastle/db/Sqlite") {}

const PRAGMAS: ReadonlyArray<string> = [
	"PRAGMA journal_mode = WAL",
	"PRAGMA foreign_keys = ON",
	"PRAGMA synchronous = NORMAL",
	"PRAGMA busy_timeout = 5000",
	"PRAGMA wal_autocheckpoint = 1000",
];

export const layer = (path: string): Layer.Layer<Sqlite> =>
	Layer.effect(Sqlite)(
		Effect.gen(function* () {
			const db = yield* Effect.acquireRelease(
				Effect.sync(() => {
					const database = new Database(path, { create: true });
					for (const pragma of PRAGMAS) {
						database.exec(pragma);
					}
					return database;
				}),
				(database) => Effect.sync(() => database.close()),
			);

			const txMutex = yield* Semaphore.make(1);

			const query = <T>(
				sql: string,
				params?: ReadonlyArray<SqliteValue>,
			): Effect.Effect<ReadonlyArray<T>, SqliteError> =>
				Effect.try({
					try: () => db.prepare(sql).all(...((params ?? []) as never[])) as Array<T>,
					catch: (cause) => new SqliteError({ cause, query: sql }),
				});

			const queryOne = <T>(
				sql: string,
				params?: ReadonlyArray<SqliteValue>,
			): Effect.Effect<T | null, SqliteError> =>
				Effect.try({
					try: () => (db.prepare(sql).get(...((params ?? []) as never[])) ?? null) as T | null,
					catch: (cause) => new SqliteError({ cause, query: sql }),
				});

			const run = (
				sql: string,
				params?: ReadonlyArray<SqliteValue>,
			): Effect.Effect<RunResult, SqliteError> =>
				Effect.try({
					try: () => {
						const result = db.prepare(sql).run(...((params ?? []) as never[]));
						return {
							changes: result.changes,
							lastInsertRowid: result.lastInsertRowid,
						};
					},
					catch: (cause) => new SqliteError({ cause, query: sql }),
				});

			const exec = (sql: string): Effect.Effect<void, SqliteError> =>
				Effect.try({
					try: () => {
						db.exec(sql);
					},
					catch: (cause) => new SqliteError({ cause, query: sql }),
				});

			const withTransaction = <A, E, R>(
				eff: Effect.Effect<A, E, R>,
			): Effect.Effect<A, E | SqliteError, R> =>
				txMutex.withPermits(1)(
					Effect.gen(function* () {
						yield* exec("BEGIN");
						const exit = yield* Effect.exit(eff);
						if (Exit.isSuccess(exit)) {
							yield* exec("COMMIT");
							return exit.value;
						} else {
							yield* exec("ROLLBACK").pipe(Effect.catch(() => Effect.void));
							return yield* Effect.failCause(exit.cause);
						}
					}),
				);

			return Sqlite.of({
				query,
				queryOne,
				run,
				exec,
				withTransaction,
				raw: db,
			});
		}),
	);
