import { SessionCursor } from "@sandcastle/schemas";
import { Effect } from "effect";
import { ForeignKeyViolationError } from "../errors";
import { type DbInstance, nowIso, tryDb } from "../utils";

const rowToSessionCursor = (row: Record<string, unknown>): SessionCursor =>
	new SessionCursor({
		sessionId: row.sessionId as string,
		lastMessageId: (row.lastMessageId as string) ?? null,
		lastMessageAt: (row.lastMessageAt as string) ?? null,
		updatedAt: row.updatedAt as string,
	});

export const createCursorsService = (db: DbInstance) => ({
	get: (sessionId: string) =>
		tryDb("cursors.get", () => {
			const row = db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM session_cursors WHERE sessionId = ?",
				)
				.get(sessionId);
			return row ? rowToSessionCursor(row) : null;
		}),

	upsert: (sessionId: string, lastMessageId: string, lastMessageAt: string) =>
		Effect.gen(function* () {
			const now = nowIso();

			const existingSession = yield* tryDb("cursors.upsert.checkSession", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT id FROM sessions WHERE id = ?",
					)
					.get(sessionId),
			);

			if (!existingSession) {
				return yield* Effect.fail(
					new ForeignKeyViolationError({
						entity: "SessionCursor",
						foreignKey: "sessionId",
						foreignId: sessionId,
					}),
				);
			}

			yield* tryDb("cursors.upsert", () =>
				db.run(
					`INSERT INTO session_cursors (sessionId, lastMessageId, lastMessageAt, updatedAt)
					 VALUES (?, ?, ?, ?)
					 ON CONFLICT(sessionId) DO UPDATE SET
					   lastMessageId = excluded.lastMessageId,
					   lastMessageAt = excluded.lastMessageAt,
					   updatedAt = excluded.updatedAt`,
					[sessionId, lastMessageId, lastMessageAt, now],
				),
			);

			return new SessionCursor({
				sessionId,
				lastMessageId,
				lastMessageAt,
				updatedAt: now,
			});
		}),

	delete: (sessionId: string) =>
		tryDb("cursors.delete", () =>
			db.run("DELETE FROM session_cursors WHERE sessionId = ?", [sessionId]),
		),
});
