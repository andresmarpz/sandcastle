/// <reference path="./sql.d.ts" />
import { Effect } from "effect";
/**
 * Migrations embedded into the binary at build time.
 *
 * The SQL is imported as text so Bun's bundler inlines it into the
 * `bun build --compile` executable. The server runtime MUST load migrations
 * this way rather than via `Migrations.loadFromDir`: inside the compiled binary
 * `import.meta.url` points into the virtual `/$bunfs` root, so scanning a real
 * directory finds nothing and boot fails (verified).
 *
 * This module is deliberately NOT re-exported from `index.ts`. The text imports
 * trip up bundlers that parse `.sql` as JS (e.g. the server's vitest run goes
 * through Vite/Rollup), so it stays off the package's public graph — tests reach
 * migrations through `loadFromDir` and never import this file. Only the server
 * runtime (compiled by Bun, which handles text imports) imports it directly via
 * `@sandcastle/db/migrations.embedded`.
 *
 * New migrations: add the `.sql` under `packages/db/migrations/` AND register it
 * here, ordered by version. The `NNN_name.sql` filename is the source of truth
 * for version + name.
 */
import m001 from "../migrations/001_projects.sql" with { type: "text" };
import m002 from "../migrations/002_workspaces.sql" with { type: "text" };
import m003 from "../migrations/003_projects_sort_order.sql" with { type: "text" };
import { computeChecksum, type Migration } from "./migrations.ts";

const EMBEDDED: ReadonlyArray<{ readonly file: string; readonly sql: string }> = [
	{ file: "001_projects.sql", sql: m001 },
	{ file: "002_workspaces.sql", sql: m002 },
	{ file: "003_projects_sort_order.sql", sql: m003 },
];

/**
 * The embedded migrations, parsed + checksummed. Same shape/semantics as
 * `Migrations.loadFromDir`, just sourced from the bundled text.
 */
export const loadEmbedded = (): Effect.Effect<ReadonlyArray<Migration>> =>
	Effect.promise(async () => {
		const collected: Array<Migration> = [];
		for (const { file, sql } of EMBEDDED) {
			const match = file.match(/^(\d{3})_(.+)\.sql$/);
			if (!match) continue;
			collected.push({
				version: parseInt(match[1]!, 10),
				name: match[2]!,
				sql,
				checksum: await computeChecksum(sql),
			});
		}
		collected.sort((a, b) => a.version - b.version);
		return collected;
	});
