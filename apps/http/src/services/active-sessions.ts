import { Context, Effect, Layer, Option, Ref } from "effect";
import type { QueryHandle } from "../agents/claude";

/**
 * Represents an active chat session with its control handles
 */
export interface ActiveSession {
	readonly queryHandle: QueryHandle;
	readonly abortController: AbortController;
	claudeSessionId: string | null;
}

/**
 * Service interface for managing active chat sessions
 */
export interface ActiveSessionsServiceInterface {
	/**
	 * Register a new active session
	 */
	readonly register: (
		sessionId: string,
		session: ActiveSession,
	) => Effect.Effect<void>;

	/**
	 * Get an active session by ID
	 */
	readonly get: (
		sessionId: string,
	) => Effect.Effect<Option.Option<ActiveSession>>;

	/**
	 * Remove a session from active tracking
	 */
	readonly remove: (sessionId: string) => Effect.Effect<void>;

	/**
	 * Update the Claude session ID for an active session
	 */
	readonly updateClaudeSessionId: (
		sessionId: string,
		claudeSessionId: string,
	) => Effect.Effect<void>;

	/**
	 * Check if a session is currently active
	 */
	readonly isActive: (sessionId: string) => Effect.Effect<boolean>;
}

/**
 * Service tag for dependency injection
 */
export class ActiveSessionsService extends Context.Tag("ActiveSessionsService")<
	ActiveSessionsService,
	ActiveSessionsServiceInterface
>() {}

/**
 * Create the active sessions service implementation
 */
export const makeActiveSessionsService = Effect.gen(function* () {
	const sessionsRef = yield* Ref.make<Map<string, ActiveSession>>(new Map());

	const service: ActiveSessionsServiceInterface = {
		register: (sessionId, session) =>
			Ref.update(sessionsRef, (sessions) => {
				const newSessions = new Map(sessions);
				newSessions.set(sessionId, session);
				return newSessions;
			}),

		get: (sessionId) =>
			Ref.get(sessionsRef).pipe(
				Effect.map((sessions) => Option.fromNullable(sessions.get(sessionId))),
			),

		remove: (sessionId) =>
			Ref.update(sessionsRef, (sessions) => {
				const newSessions = new Map(sessions);
				newSessions.delete(sessionId);
				return newSessions;
			}),

		updateClaudeSessionId: (sessionId, claudeSessionId) =>
			Ref.update(sessionsRef, (sessions) => {
				const session = sessions.get(sessionId);
				if (session) {
					const newSessions = new Map(sessions);
					newSessions.set(sessionId, { ...session, claudeSessionId });
					return newSessions;
				}
				return sessions;
			}),

		isActive: (sessionId) =>
			Ref.get(sessionsRef).pipe(
				Effect.map((sessions) => sessions.has(sessionId)),
			),
	};

	return service;
});

/**
 * Live layer for the active sessions service
 */
export const ActiveSessionsServiceLive = Layer.effect(
	ActiveSessionsService,
	makeActiveSessionsService,
);
