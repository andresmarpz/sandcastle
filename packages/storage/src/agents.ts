import { Effect } from "effect";

import { Agent } from "./entities";
import {
	AgentNotFoundError,
	type DatabaseError,
	ForeignKeyViolationError,
} from "./errors";
import {
	type DbInstance,
	generateId,
	nowIso,
	type SQLQueryBindings,
	tryDb,
} from "./utils";

const rowToAgent = (row: Record<string, unknown>): Agent =>
	new Agent({
		id: row.id as string,
		sessionId: row.session_id as string,
		processId: (row.process_id as number) ?? null,
		status: row.status as
			| "starting"
			| "running"
			| "idle"
			| "stopped"
			| "crashed",
		startedAt: row.started_at as string,
		stoppedAt: (row.stopped_at as string) ?? null,
		exitCode: (row.exit_code as number) ?? null,
	});

export const createAgentsService = (db: DbInstance) => ({
	list: () =>
		tryDb("agents.list", () =>
			db
				.query<Record<string, unknown>, []>(
					"SELECT * FROM agents ORDER BY started_at DESC",
				)
				.all()
				.map(rowToAgent),
		),

	listBySession: (sessionId: string) =>
		tryDb("agents.listBySession", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM agents WHERE session_id = ? ORDER BY started_at DESC",
				)
				.all(sessionId)
				.map(rowToAgent),
		),

	get: (id: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("agents.get", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM agents WHERE id = ?",
					)
					.get(id),
			);
			if (!row) {
				return yield* Effect.fail(new AgentNotFoundError({ id }));
			}
			return rowToAgent(row);
		}),

	create: (input: {
		sessionId: string;
		processId?: number | null;
		status?: "starting" | "running" | "idle" | "stopped" | "crashed";
	}) =>
		Effect.gen(function* () {
			const now = nowIso();
			const id = generateId();
			const status = input.status ?? "starting";
			const processId = input.processId ?? null;

			const existingSession = yield* tryDb("agents.create.checkSession", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT id FROM sessions WHERE id = ?",
					)
					.get(input.sessionId),
			);

			if (!existingSession) {
				return yield* Effect.fail(
					new ForeignKeyViolationError({
						entity: "Agent",
						foreignKey: "sessionId",
						foreignId: input.sessionId,
					}),
				);
			}

			yield* tryDb("agents.create", () =>
				db.run(
					`INSERT INTO agents (id, session_id, process_id, status, started_at, stopped_at, exit_code)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
					[id, input.sessionId, processId, status, now, null, null],
				),
			);

			return new Agent({
				id,
				sessionId: input.sessionId,
				processId,
				status,
				startedAt: now,
				stoppedAt: null,
				exitCode: null,
			});
		}),

	update: (
		id: string,
		input: {
			processId?: number | null;
			status?: "starting" | "running" | "idle" | "stopped" | "crashed";
			stoppedAt?: string | null;
			exitCode?: number | null;
		},
		getAgent: (
			id: string,
		) => Effect.Effect<Agent, AgentNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			const existing = yield* getAgent(id);

			const updates: string[] = [];
			const values: SQLQueryBindings[] = [];

			if (input.processId !== undefined) {
				updates.push("process_id = ?");
				values.push(input.processId);
			}
			if (input.status !== undefined) {
				updates.push("status = ?");
				values.push(input.status);
			}
			if (input.stoppedAt !== undefined) {
				updates.push("stopped_at = ?");
				values.push(input.stoppedAt);
			}
			if (input.exitCode !== undefined) {
				updates.push("exit_code = ?");
				values.push(input.exitCode);
			}

			if (updates.length === 0) return existing;

			values.push(id);

			yield* tryDb("agents.update", () =>
				db.run(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`, values),
			);

			return new Agent({
				...existing,
				processId:
					input.processId !== undefined ? input.processId : existing.processId,
				status: input.status ?? existing.status,
				stoppedAt:
					input.stoppedAt !== undefined ? input.stoppedAt : existing.stoppedAt,
				exitCode:
					input.exitCode !== undefined ? input.exitCode : existing.exitCode,
			});
		}),

	delete: (
		id: string,
		getAgent: (
			id: string,
		) => Effect.Effect<Agent, AgentNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getAgent(id);
			yield* tryDb("agents.delete", () =>
				db.run("DELETE FROM agents WHERE id = ?", [id]),
			);
		}),
});
