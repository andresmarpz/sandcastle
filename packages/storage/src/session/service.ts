import { Session } from "@sandcastle/schemas";
import { Effect } from "effect";
import {
	type DatabaseError,
	ForeignKeyViolationError,
	SessionNotFoundError,
} from "../errors";
import {
	type DbInstance,
	generateId,
	nowIso,
	type SQLQueryBindings,
	tryDb,
} from "../utils";

const rowToSession = (row: Record<string, unknown>): Session =>
	new Session({
		id: row.id as string,
		repositoryId: row.repositoryId as string,
		worktreeId: (row.worktreeId as string) ?? null,
		workingPath: row.workingPath as string,
		title: row.title as string,
		description: (row.description as string) ?? null,
		status: row.status as
			| "created"
			| "active"
			| "paused"
			| "completed"
			| "failed",
		claudeSessionId: (row.claudeSessionId as string) ?? null,
		model: (row.model as string) ?? null,
		totalCostUsd: (row.totalCostUsd as number) ?? 0,
		inputTokens: (row.inputTokens as number) ?? 0,
		outputTokens: (row.outputTokens as number) ?? 0,
		createdAt: row.createdAt as string,
		lastActivityAt: row.lastActivityAt as string,
	});

export const createSessionsService = (db: DbInstance) => ({
	list: () =>
		tryDb("sessions.list", () =>
			db
				.query<Record<string, unknown>, []>(
					"SELECT * FROM sessions ORDER BY createdAt DESC",
				)
				.all()
				.map(rowToSession),
		),

	listByWorktree: (worktreeId: string) =>
		tryDb("sessions.listByWorktree", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM sessions WHERE worktreeId = ? ORDER BY createdAt DESC",
				)
				.all(worktreeId)
				.map(rowToSession),
		),

	listByRepository: (repositoryId: string) =>
		tryDb("sessions.listByRepository", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM sessions WHERE repositoryId = ? ORDER BY createdAt DESC",
				)
				.all(repositoryId)
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
		repositoryId: string;
		worktreeId?: string | null;
		workingPath: string;
		title: string;
		description?: string | null;
		status?: "created" | "active" | "paused" | "completed" | "failed";
	}) =>
		Effect.gen(function* () {
			const now = nowIso();
			const id = generateId();
			const status = input.status ?? "created";
			const description = input.description ?? null;
			const worktreeId = input.worktreeId ?? null;

			// Validate repository exists
			const existingRepository = yield* tryDb(
				"sessions.create.checkRepository",
				() =>
					db
						.query<Record<string, unknown>, [string]>(
							"SELECT id FROM repositories WHERE id = ?",
						)
						.get(input.repositoryId),
			);

			if (!existingRepository) {
				return yield* Effect.fail(
					new ForeignKeyViolationError({
						entity: "Session",
						foreignKey: "repositoryId",
						foreignId: input.repositoryId,
					}),
				);
			}

			// Only validate worktree if provided
			if (worktreeId) {
				const existingWorktree = yield* tryDb(
					"sessions.create.checkWorktree",
					() =>
						db
							.query<Record<string, unknown>, [string]>(
								"SELECT id FROM worktrees WHERE id = ?",
							)
							.get(worktreeId),
				);

				if (!existingWorktree) {
					return yield* Effect.fail(
						new ForeignKeyViolationError({
							entity: "Session",
							foreignKey: "worktreeId",
							foreignId: worktreeId,
						}),
					);
				}
			}

			yield* tryDb("sessions.create", () =>
				db.run(
					`INSERT INTO sessions (id, repositoryId, worktreeId, workingPath, title, description, status, claudeSessionId, model, totalCostUsd, inputTokens, outputTokens, createdAt, lastActivityAt)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						id,
						input.repositoryId,
						worktreeId,
						input.workingPath,
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
				repositoryId: input.repositoryId,
				worktreeId,
				workingPath: input.workingPath,
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
				updates.push("claudeSessionId = ?");
				values.push(input.claudeSessionId);
			}
			if (input.model !== undefined) {
				updates.push("model = ?");
				values.push(input.model);
			}
			if (input.totalCostUsd !== undefined) {
				updates.push("totalCostUsd = ?");
				values.push(input.totalCostUsd);
			}
			if (input.inputTokens !== undefined) {
				updates.push("inputTokens = ?");
				values.push(input.inputTokens);
			}
			if (input.outputTokens !== undefined) {
				updates.push("outputTokens = ?");
				values.push(input.outputTokens);
			}
			if (input.lastActivityAt !== undefined) {
				updates.push("lastActivityAt = ?");
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
				db.run("UPDATE sessions SET lastActivityAt = ? WHERE id = ?", [
					nowIso(),
					id,
				]),
			);
		}),
});
