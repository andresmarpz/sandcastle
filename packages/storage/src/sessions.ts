import { Effect } from "effect";

import { Session } from "./entities";
import {
	type DatabaseError,
	ForeignKeyViolationError,
	SessionNotFoundError,
} from "./errors";
import {
	type DbInstance,
	generateId,
	nowIso,
	type SQLQueryBindings,
	tryDb,
} from "./utils";

const rowToSession = (row: Record<string, unknown>): Session =>
	new Session({
		id: row.id as string,
		worktreeId: row.worktree_id as string,
		title: row.title as string,
		description: (row.description as string) ?? null,
		status: row.status as
			| "created"
			| "active"
			| "paused"
			| "completed"
			| "failed",
		claudeSessionId: (row.claude_session_id as string) ?? null,
		model: (row.model as string) ?? null,
		totalCostUsd: (row.total_cost_usd as number) ?? 0,
		inputTokens: (row.input_tokens as number) ?? 0,
		outputTokens: (row.output_tokens as number) ?? 0,
		createdAt: row.created_at as string,
		lastActivityAt: row.last_activity_at as string,
	});

export const createSessionsService = (db: DbInstance) => ({
	list: () =>
		tryDb("sessions.list", () =>
			db
				.query<Record<string, unknown>, []>(
					"SELECT * FROM sessions ORDER BY created_at DESC",
				)
				.all()
				.map(rowToSession),
		),

	listByWorktree: (worktreeId: string) =>
		tryDb("sessions.listByWorktree", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM sessions WHERE worktree_id = ? ORDER BY created_at DESC",
				)
				.all(worktreeId)
				.map(rowToSession),
		),

	get: (id: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("sessions.get", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM sessions WHERE id = ?",
					)
					.get(id),
			);
			if (!row) {
				return yield* Effect.fail(new SessionNotFoundError({ id }));
			}
			return rowToSession(row);
		}),

	create: (input: {
		worktreeId: string;
		title: string;
		description?: string | null;
		status?: "created" | "active" | "paused" | "completed" | "failed";
	}) =>
		Effect.gen(function* () {
			const now = nowIso();
			const id = generateId();
			const status = input.status ?? "created";
			const description = input.description ?? null;

			const existingWorktree = yield* tryDb(
				"sessions.create.checkWorktree",
				() =>
					db
						.query<Record<string, unknown>, [string]>(
							"SELECT id FROM worktrees WHERE id = ?",
						)
						.get(input.worktreeId),
			);

			if (!existingWorktree) {
				return yield* Effect.fail(
					new ForeignKeyViolationError({
						entity: "Session",
						foreignKey: "worktreeId",
						foreignId: input.worktreeId,
					}),
				);
			}

			yield* tryDb("sessions.create", () =>
				db.run(
					`INSERT INTO sessions (id, worktree_id, title, description, status, claude_session_id, model, total_cost_usd, input_tokens, output_tokens, created_at, last_activity_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						id,
						input.worktreeId,
						input.title,
						description,
						status,
						null,
						null,
						0,
						0,
						0,
						now,
						now,
					],
				),
			);

			return new Session({
				id,
				worktreeId: input.worktreeId,
				title: input.title,
				description,
				status,
				claudeSessionId: null,
				model: null,
				totalCostUsd: 0,
				inputTokens: 0,
				outputTokens: 0,
				createdAt: now,
				lastActivityAt: now,
			});
		}),

	update: (
		id: string,
		input: {
			title?: string;
			description?: string | null;
			status?: "created" | "active" | "paused" | "completed" | "failed";
			claudeSessionId?: string | null;
			model?: string | null;
			totalCostUsd?: number;
			inputTokens?: number;
			outputTokens?: number;
			lastActivityAt?: string;
		},
		getSession: (
			id: string,
		) => Effect.Effect<Session, SessionNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			const existing = yield* getSession(id);

			const updates: string[] = [];
			const values: SQLQueryBindings[] = [];

			if (input.title !== undefined) {
				updates.push("title = ?");
				values.push(input.title);
			}
			if (input.description !== undefined) {
				updates.push("description = ?");
				values.push(input.description);
			}
			if (input.status !== undefined) {
				updates.push("status = ?");
				values.push(input.status);
			}
			if (input.claudeSessionId !== undefined) {
				updates.push("claude_session_id = ?");
				values.push(input.claudeSessionId);
			}
			if (input.model !== undefined) {
				updates.push("model = ?");
				values.push(input.model);
			}
			if (input.totalCostUsd !== undefined) {
				updates.push("total_cost_usd = ?");
				values.push(input.totalCostUsd);
			}
			if (input.inputTokens !== undefined) {
				updates.push("input_tokens = ?");
				values.push(input.inputTokens);
			}
			if (input.outputTokens !== undefined) {
				updates.push("output_tokens = ?");
				values.push(input.outputTokens);
			}
			if (input.lastActivityAt !== undefined) {
				updates.push("last_activity_at = ?");
				values.push(input.lastActivityAt);
			}

			if (updates.length === 0) return existing;

			values.push(id);

			yield* tryDb("sessions.update", () =>
				db.run(
					`UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`,
					values,
				),
			);

			return new Session({
				...existing,
				title: input.title ?? existing.title,
				description:
					input.description !== undefined
						? input.description
						: existing.description,
				status: input.status ?? existing.status,
				claudeSessionId:
					input.claudeSessionId !== undefined
						? input.claudeSessionId
						: existing.claudeSessionId,
				model: input.model !== undefined ? input.model : existing.model,
				totalCostUsd: input.totalCostUsd ?? existing.totalCostUsd,
				inputTokens: input.inputTokens ?? existing.inputTokens,
				outputTokens: input.outputTokens ?? existing.outputTokens,
				lastActivityAt: input.lastActivityAt ?? existing.lastActivityAt,
			});
		}),

	delete: (
		id: string,
		getSession: (
			id: string,
		) => Effect.Effect<Session, SessionNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getSession(id);
			yield* tryDb("sessions.delete", () =>
				db.run("DELETE FROM sessions WHERE id = ?", [id]),
			);
		}),

	touch: (
		id: string,
		getSession: (
			id: string,
		) => Effect.Effect<Session, SessionNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getSession(id);
			yield* tryDb("sessions.touch", () =>
				db.run("UPDATE sessions SET last_activity_at = ? WHERE id = ?", [
					nowIso(),
					id,
				]),
			);
		}),
});
