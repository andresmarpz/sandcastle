import { Turn, type TurnStatus } from "@sandcastle/schemas";
import { Effect } from "effect";
import {
	type DatabaseError,
	ForeignKeyViolationError,
	TurnNotFoundError,
} from "../errors";
import { type DbInstance, generateId, nowIso, tryDb } from "../utils";

const rowToTurn = (row: Record<string, unknown>): Turn =>
	new Turn({
		id: row.id as string,
		sessionId: row.sessionId as string,
		status: row.status as TurnStatus,
		startedAt: row.startedAt as string,
		completedAt: (row.completedAt as string) ?? null,
		reason: (row.reason as string) ?? null,
	});

export const createTurnsService = (db: DbInstance) => ({
	list: () =>
		tryDb("turns.list", () =>
			db
				.query<Record<string, unknown>, []>(
					"SELECT * FROM turns ORDER BY startedAt DESC",
				)
				.all()
				.map(rowToTurn),
		),

	listBySession: (sessionId: string) =>
		tryDb("turns.listBySession", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM turns WHERE sessionId = ? ORDER BY startedAt ASC",
				)
				.all(sessionId)
				.map(rowToTurn),
		),

	get: (id: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("turns.get", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM turns WHERE id = ?",
					)
					.get(id),
			);
			if (!row) {
				return yield* Effect.fail(new TurnNotFoundError({ id }));
			}
			return rowToTurn(row);
		}),

	create: (input: { sessionId: string }) =>
		Effect.gen(function* () {
			const now = nowIso();
			const id = generateId();

			const existingSession = yield* tryDb("turns.create.checkSession", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT id FROM sessions WHERE id = ?",
					)
					.get(input.sessionId),
			);

			if (!existingSession) {
				return yield* Effect.fail(
					new ForeignKeyViolationError({
						entity: "Turn",
						foreignKey: "sessionId",
						foreignId: input.sessionId,
					}),
				);
			}

			yield* tryDb("turns.create", () =>
				db.run(
					`INSERT INTO turns (id, sessionId, status, startedAt, completedAt, reason)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[id, input.sessionId, "streaming", now, null, null],
				),
			);

			return new Turn({
				id,
				sessionId: input.sessionId,
				status: "streaming",
				startedAt: now,
				completedAt: null,
				reason: null,
			});
		}),

	complete: (
		id: string,
		reason: "completed" | "interrupted" | "error",
		getTurn: (
			id: string,
		) => Effect.Effect<Turn, TurnNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			const existing = yield* getTurn(id);
			const now = nowIso();

			yield* tryDb("turns.complete", () =>
				db.run(
					"UPDATE turns SET status = ?, completedAt = ?, reason = ? WHERE id = ?",
					[reason, now, reason, id],
				),
			);

			return new Turn({
				...existing,
				status: reason,
				completedAt: now,
				reason,
			});
		}),

	delete: (
		id: string,
		getTurn: (
			id: string,
		) => Effect.Effect<Turn, TurnNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getTurn(id);
			yield* tryDb("turns.delete", () =>
				db.run("DELETE FROM turns WHERE id = ?", [id]),
			);
		}),
});
