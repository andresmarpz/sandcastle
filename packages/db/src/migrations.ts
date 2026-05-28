import { Effect } from "effect";
import { Sqlite } from "./client.ts";
import type { SqliteError } from "./errors.ts";

export interface Migration {
	readonly version: number;
	readonly name: string;
	readonly sql: string;
	readonly checksum: string;
}

const BOOKKEEPING_TABLE = `
CREATE TABLE IF NOT EXISTS _migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum   TEXT NOT NULL
)
`;

interface AppliedRow {
	readonly version: number;
	readonly name: string;
	readonly checksum: string;
}

export const apply = (
	migrations: ReadonlyArray<Migration>,
): Effect.Effect<void, SqliteError, Sqlite> =>
	Effect.gen(function* () {
		const sqlite = yield* Sqlite;
		yield* sqlite.exec(BOOKKEEPING_TABLE);

		const appliedRows = yield* sqlite.query<AppliedRow>(
			"SELECT version, name, checksum FROM _migrations ORDER BY version",
		);
		const applied = new Map<number, AppliedRow>(appliedRows.map((row) => [row.version, row]));

		const ordered = [...migrations].sort((a, b) => a.version - b.version);

		for (const m of ordered) {
			const known = applied.get(m.version);
			if (known === undefined) {
				yield* sqlite.withTransaction(
					Effect.gen(function* () {
						yield* sqlite.exec(m.sql);
						yield* sqlite.run(
							"INSERT INTO _migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)",
							[m.version, m.name, new Date().toISOString(), m.checksum],
						);
					}),
				);
				yield* Effect.logInfo(`[db] applied migration ${formatVersion(m.version)} ${m.name}`);
			} else if (known.checksum !== m.checksum) {
				yield* Effect.logWarning(
					`[db] checksum drift on migration ${formatVersion(m.version)} ${m.name}: stored=${known.checksum} current=${m.checksum}`,
				);
			}
		}
	});

const formatVersion = (n: number): string => n.toString().padStart(3, "0");

export const computeChecksum = async (sql: string): Promise<string> => {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(sql);
	return hasher.digest("hex");
};

export const loadFromDir = (dirPath: string): Effect.Effect<ReadonlyArray<Migration>> =>
	Effect.tryPromise({
		try: async () => {
			const glob = new Bun.Glob("*.sql");
			const collected: Array<Migration> = [];
			for await (const filename of glob.scan({ cwd: dirPath })) {
				const match = filename.match(/^(\d{3})_(.+)\.sql$/);
				if (!match) continue;
				const sql = await Bun.file(`${dirPath}/${filename}`).text();
				const checksum = await computeChecksum(sql);
				collected.push({
					version: parseInt(match[1]!, 10),
					name: match[2]!,
					sql,
					checksum,
				});
			}
			collected.sort((a, b) => a.version - b.version);
			return collected;
		},
		catch: (cause) => new Error(`Failed to load migrations from ${dirPath}`, { cause }),
	}).pipe(Effect.orDie);
