import {
	Context,
	Effect,
	Layer,
	Option,
	PubSub,
	Ref,
	type Fiber,
} from "effect";
import type { SequencedEvent, SessionStatus } from "@sandcastle/rpc";
import type { QueryHandle } from "../agents/claude";

/**
 * Represents an active chat session with its control handles
 */
export interface ActiveSession {
	queryHandle: QueryHandle | null;
	abortController: AbortController | null;
	claudeSessionId: string | null;
	pubsub: PubSub.PubSub<SequencedEvent>;
	eventBuffer: Ref.Ref<SequencedEvent[]>;
	lastSeq: Ref.Ref<number>;
	epoch: string;
	bufferHasGap: Ref.Ref<boolean>;
	subscriberCount: Ref.Ref<number>;
	status: Ref.Ref<SessionStatus>;
	cleanupFiber: Fiber.RuntimeFiber<unknown, unknown> | null;
}

export interface ActiveSessionInput {
	queryHandle?: QueryHandle | null;
	abortController?: AbortController | null;
	claudeSessionId?: string | null;
	pubsub?: PubSub.PubSub<SequencedEvent>;
	eventBuffer?: Ref.Ref<SequencedEvent[]>;
	lastSeq?: Ref.Ref<number>;
	epoch?: string;
	bufferHasGap?: Ref.Ref<boolean>;
	subscriberCount?: Ref.Ref<number>;
	status?: Ref.Ref<SessionStatus>;
	cleanupFiber?: Fiber.RuntimeFiber<unknown, unknown> | null;
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
		session: ActiveSessionInput,
	) => Effect.Effect<void>;

	/**
	 * Get existing session or create with defaults
	 */
	readonly getOrCreate: (
		sessionId: string,
		session?: ActiveSessionInput,
	) => Effect.Effect<ActiveSession>;

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
	 * Update a session in-place if it exists
	 */
	readonly update: (
		sessionId: string,
		update: (session: ActiveSession) => ActiveSession,
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
	const makeActiveSession = (input: ActiveSessionInput) =>
		Effect.gen(function* () {
			const pubsub = input.pubsub ?? (yield* PubSub.unbounded<SequencedEvent>());
			const eventBuffer =
				input.eventBuffer ?? (yield* Ref.make<SequencedEvent[]>([]));
			const lastSeq = input.lastSeq ?? (yield* Ref.make(0));
			const bufferHasGap = input.bufferHasGap ?? (yield* Ref.make(false));
			const subscriberCount = input.subscriberCount ?? (yield* Ref.make(0));
			const status =
				input.status ?? (yield* Ref.make<SessionStatus>("idle"));
			const epoch = input.epoch ?? crypto.randomUUID();

			return {
				queryHandle: input.queryHandle ?? null,
				abortController: input.abortController ?? null,
				claudeSessionId: input.claudeSessionId ?? null,
				pubsub,
				eventBuffer,
				lastSeq,
				epoch,
				bufferHasGap,
				subscriberCount,
				status,
				cleanupFiber: input.cleanupFiber ?? null,
			};
		});

	const service: ActiveSessionsServiceInterface = {
		register: (sessionId, session) =>
			Effect.gen(function* () {
				const activeSession = yield* makeActiveSession(session);
				yield* Ref.update(sessionsRef, (sessions) => {
					const newSessions = new Map(sessions);
					newSessions.set(sessionId, activeSession);
					return newSessions;
				});
			}),

		getOrCreate: (sessionId, session = {}) =>
			Effect.gen(function* () {
				const existing = yield* Ref.get(sessionsRef).pipe(
					Effect.map((sessions) => Option.fromNullable(sessions.get(sessionId))),
				);

				if (Option.isSome(existing)) {
					return existing.value;
				}

				const activeSession = yield* makeActiveSession(session);
				yield* Ref.update(sessionsRef, (sessions) => {
					const newSessions = new Map(sessions);
					newSessions.set(sessionId, activeSession);
					return newSessions;
				});
				return activeSession;
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

		update: (sessionId, update) =>
			Ref.update(sessionsRef, (sessions) => {
				const session = sessions.get(sessionId);
				if (!session) return sessions;
				const newSessions = new Map(sessions);
				newSessions.set(sessionId, update(session));
				return newSessions;
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
