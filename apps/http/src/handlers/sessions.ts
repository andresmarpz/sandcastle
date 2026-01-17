import {
	DatabaseRpcError,
	ForeignKeyViolationRpcError,
	SessionNotFoundRpcError,
	SessionRpc,
} from "@sandcastle/rpc";
import {
	type DatabaseError,
	type ForeignKeyViolationError,
	Session,
	type SessionNotFoundError,
	StorageService,
	StorageServiceDefault,
	Turn,
} from "@sandcastle/storage";
import { Effect, Layer } from "effect";
import { SessionHub, SessionHubLive } from "../services/session-hub";

const mapDatabaseError = (error: DatabaseError): DatabaseRpcError =>
	new DatabaseRpcError({ operation: error.operation, message: error.message });

const mapNotFoundError = (
	error: SessionNotFoundError | DatabaseError,
): SessionNotFoundRpcError | DatabaseRpcError => {
	if (error._tag === "SessionNotFoundError") {
		return new SessionNotFoundRpcError({ id: error.id });
	}
	return mapDatabaseError(error);
};

const mapCreateError = (
	error: ForeignKeyViolationError | DatabaseError,
): ForeignKeyViolationRpcError | DatabaseRpcError => {
	if (error._tag === "ForeignKeyViolationError") {
		return new ForeignKeyViolationRpcError({
			entity: error.entity,
			foreignKey: error.foreignKey,
			foreignId: error.foreignId,
		});
	}
	return mapDatabaseError(error);
};

const toSession = (session: {
	id: string;
	worktreeId: string;
	title: string;
	description: string | null;
	status: "created" | "active" | "paused" | "completed" | "failed";
	claudeSessionId: string | null;
	model: string | null;
	totalCostUsd: number;
	inputTokens: number;
	outputTokens: number;
	lastActivityAt: string;
	createdAt: string;
}): Session =>
	new Session({
		id: session.id,
		worktreeId: session.worktreeId,
		title: session.title,
		description: session.description,
		status: session.status,
		claudeSessionId: session.claudeSessionId,
		model: session.model,
		totalCostUsd: session.totalCostUsd,
		inputTokens: session.inputTokens,
		outputTokens: session.outputTokens,
		lastActivityAt: session.lastActivityAt,
		createdAt: session.createdAt,
	});

const toTurn = (turn: {
	id: string;
	sessionId: string;
	status: "streaming" | "completed" | "interrupted" | "error";
	startedAt: string;
	completedAt: string | null;
	reason: string | null;
}): Turn =>
	new Turn({
		id: turn.id,
		sessionId: turn.sessionId,
		status: turn.status,
		startedAt: turn.startedAt,
		completedAt: turn.completedAt,
		reason: turn.reason,
	});

export const SessionRpcHandlers = SessionRpc.toLayer(
	Effect.gen(function* () {
		const storage = yield* StorageService;
		const sessionHub = yield* SessionHub;

		return SessionRpc.of({
			"session.list": () =>
				storage.sessions.list().pipe(
					Effect.map((sessions) => sessions.map(toSession)),
					Effect.mapError(mapDatabaseError),
				),

			"session.listByWorktree": (params) =>
				storage.sessions.listByWorktree(params.worktreeId).pipe(
					Effect.map((sessions) => sessions.map(toSession)),
					Effect.mapError(mapDatabaseError),
				),

			"session.get": (params) =>
				storage.sessions
					.get(params.id)
					.pipe(Effect.map(toSession), Effect.mapError(mapNotFoundError)),

			"session.create": (params) =>
				storage.sessions
					.create({
						worktreeId: params.worktreeId,
						title: params.title,
						description: params.description,
					})
					.pipe(Effect.map(toSession), Effect.mapError(mapCreateError)),

			"session.update": (params) =>
				storage.sessions
					.update(params.id, {
						title: params.input.title,
						description: params.input.description,
						status: params.input.status,
						claudeSessionId: params.input.claudeSessionId,
						model: params.input.model,
						totalCostUsd: params.input.totalCostUsd,
						inputTokens: params.input.inputTokens,
						outputTokens: params.input.outputTokens,
						lastActivityAt: params.input.lastActivityAt,
					})
					.pipe(Effect.map(toSession), Effect.mapError(mapNotFoundError)),

			"session.delete": (params) =>
				Effect.gen(function* () {
					// Notify subscribers and clean up hub state BEFORE storage deletion
					yield* sessionHub.deleteSession(params.id);
					// Delete from storage
					yield* storage.sessions.delete(params.id);
				}).pipe(Effect.mapError(mapNotFoundError)),

			"session.touch": (params) =>
				storage.sessions
					.touch(params.id)
					.pipe(Effect.mapError(mapNotFoundError)),

			"session.listTurns": (params) =>
				Effect.gen(function* () {
					// Verify session exists first
					yield* storage.sessions.get(params.sessionId);
					// Fetch turns for the session
					const turns = yield* storage.turns.listBySession(params.sessionId);
					return { turns: turns.map(toTurn) };
				}).pipe(Effect.mapError(mapNotFoundError)),
		});
	}),
);

export const SessionRpcHandlersLive = SessionRpcHandlers.pipe(
	Layer.provide(StorageServiceDefault),
	Layer.provide(SessionHubLive),
);
