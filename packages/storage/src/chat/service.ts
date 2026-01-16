import {
	ChatMessage,
	MessagePart,
	type MessageRole,
} from "@sandcastle/schemas";
import { Effect, Schema } from "effect";
import {
	ChatMessageNotFoundError,
	type DatabaseError,
	ForeignKeyViolationError,
} from "../errors";
import { type DbInstance, generateId, nowIso, tryDb } from "../utils";

const rowToChatMessage = (row: Record<string, unknown>): ChatMessage => {
	const partsJson = row.parts as string;
	const partsParsed = JSON.parse(partsJson);
	const parts = Schema.decodeUnknownSync(Schema.Array(MessagePart))(
		partsParsed,
	);

	const metadataJson = row.metadata as string | null;
	const metadata = metadataJson ? JSON.parse(metadataJson) : undefined;

	return new ChatMessage({
		id: row.id as string,
		sessionId: row.session_id as string,
		role: row.role as MessageRole,
		parts,
		createdAt: row.created_at as string,
		metadata,
	});
};

export const createChatMessagesService = (db: DbInstance) => ({
	listBySession: (sessionId: string) =>
		tryDb("chatMessages.listBySession", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
				)
				.all(sessionId)
				.map(rowToChatMessage),
		),

	get: (id: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("chatMessages.get", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM chat_messages WHERE id = ?",
					)
					.get(id),
			);
			if (!row) {
				return yield* Effect.fail(new ChatMessageNotFoundError({ id }));
			}
			return rowToChatMessage(row);
		}),

	create: (input: {
		id?: string;
		sessionId: string;
		role: MessageRole;
		parts: readonly (typeof MessagePart.Type)[];
		metadata?: Record<string, unknown>;
	}) =>
		Effect.gen(function* () {
			const now = nowIso();
			const id = input.id ?? generateId();

			const existingSession = yield* tryDb(
				"chatMessages.create.checkSession",
				() =>
					db
						.query<Record<string, unknown>, [string]>(
							"SELECT id FROM sessions WHERE id = ?",
						)
						.get(input.sessionId),
			);

			if (!existingSession) {
				return yield* Effect.fail(
					new ForeignKeyViolationError({
						entity: "ChatMessage",
						foreignKey: "sessionId",
						foreignId: input.sessionId,
					}),
				);
			}

			const partsJson = JSON.stringify(input.parts);
			const metadataJson = input.metadata
				? JSON.stringify(input.metadata)
				: null;

			yield* tryDb("chatMessages.create", () =>
				db.run(
					`INSERT INTO chat_messages (id, session_id, role, parts, created_at, metadata)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[id, input.sessionId, input.role, partsJson, now, metadataJson],
				),
			);

			return new ChatMessage({
				id,
				sessionId: input.sessionId,
				role: input.role,
				parts: input.parts,
				createdAt: now,
				metadata: input.metadata,
			});
		}),

	delete: (
		id: string,
		getChatMessage: (
			id: string,
		) => Effect.Effect<ChatMessage, ChatMessageNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getChatMessage(id);
			yield* tryDb("chatMessages.delete", () =>
				db.run("DELETE FROM chat_messages WHERE id = ?", [id]),
			);
		}),

	deleteBySession: (sessionId: string) =>
		tryDb("chatMessages.deleteBySession", () =>
			db.run("DELETE FROM chat_messages WHERE session_id = ?", [sessionId]),
		),

	createMany: (
		inputs: Array<{
			id?: string;
			sessionId: string;
			role: MessageRole;
			parts: readonly (typeof MessagePart.Type)[];
			turnId?: string;
			seq?: number;
			metadata?: Record<string, unknown>;
		}>,
	) =>
		Effect.gen(function* () {
			if (inputs.length === 0) return [];

			const now = nowIso();
			const results: ChatMessage[] = [];

			for (const input of inputs) {
				const id = input.id ?? generateId();
				const partsJson = JSON.stringify(input.parts);
				const metadataJson = input.metadata
					? JSON.stringify(input.metadata)
					: null;

				yield* tryDb("chatMessages.createMany", () =>
					db.run(
						`INSERT INTO chat_messages (id, session_id, role, parts, created_at, metadata, turnId, seq)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							id,
							input.sessionId,
							input.role,
							partsJson,
							now,
							metadataJson,
							input.turnId ?? null,
							input.seq ?? 0,
						],
					),
				);

				results.push(
					new ChatMessage({
						id,
						sessionId: input.sessionId,
						role: input.role,
						parts: input.parts,
						createdAt: now,
						metadata: input.metadata,
					}),
				);
			}

			return results;
		}),

	listByTurn: (turnId: string) =>
		tryDb("chatMessages.listByTurn", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM chat_messages WHERE turnId = ? ORDER BY seq ASC, created_at ASC",
				)
				.all(turnId)
				.map(rowToChatMessage),
		),

	getMessagesSince: (sessionId: string, afterMessageId?: string) =>
		Effect.gen(function* () {
			if (!afterMessageId) {
				return yield* tryDb("chatMessages.getMessagesSince.all", () =>
					db
						.query<Record<string, unknown>, [string]>(
							"SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
						)
						.all(sessionId)
						.map(rowToChatMessage),
				);
			}

			const cursorRow = yield* tryDb(
				"chatMessages.getMessagesSince.getCursor",
				() =>
					db
						.query<Record<string, unknown>, [string]>(
							"SELECT created_at FROM chat_messages WHERE id = ?",
						)
						.get(afterMessageId),
			);

			if (!cursorRow) {
				return yield* tryDb("chatMessages.getMessagesSince.noCursor", () =>
					db
						.query<Record<string, unknown>, [string]>(
							"SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
						)
						.all(sessionId)
						.map(rowToChatMessage),
				);
			}

			return yield* tryDb("chatMessages.getMessagesSince.afterCursor", () =>
				db
					.query<Record<string, unknown>, [string, string, string, string]>(
						`SELECT * FROM chat_messages
						 WHERE session_id = ? AND (created_at > ? OR (created_at = ? AND id > ?))
						 ORDER BY created_at ASC`,
					)
					.all(
						sessionId,
						cursorRow.created_at as string,
						cursorRow.created_at as string,
						afterMessageId,
					)
					.map(rowToChatMessage),
			);
		}),

	getLatestBySession: (sessionId: string) =>
		tryDb("chatMessages.getLatestBySession", () => {
			const row = db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
				)
				.get(sessionId);
			return row ? rowToChatMessage(row) : null;
		}),
});
