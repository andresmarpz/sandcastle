import {
	ChatRpc,
	ChatSessionNotFoundRpcError,
	GetHistoryResult,
} from "@sandcastle/rpc";
import { StorageService, StorageServiceDefault } from "@sandcastle/storage";
import { Effect, Layer } from "effect";
import { SessionHub, SessionHubLive } from "../services/session-hub";

const DEFAULT_HISTORY_LIMIT = 50;

export const ChatRpcHandlers = ChatRpc.toLayer(
	Effect.gen(function* () {
		const hub = yield* SessionHub;
		const storage = yield* StorageService;

		return ChatRpc.of({
			// NOTE: The Rpc layer automatically converts Mailbox to Stream
			"chat.subscribe": (params) => hub.subscribe(params.sessionId),

			"chat.send": (params) =>
				hub.sendMessage(
					params.sessionId,
					params.content,
					params.clientMessageId,
					params.parts,
				),

			"chat.interrupt": (params) => hub.interrupt(params.sessionId),

			"chat.dequeue": (params) =>
				hub.dequeueMessage(params.sessionId, params.messageId),

			"chat.getState": (params) => hub.getState(params.sessionId),

			"chat.getHistory": (params) =>
				Effect.gen(function* () {
					const limit = params.limit ?? DEFAULT_HISTORY_LIMIT;

					// Verify session exists
					yield* storage.sessions.get(params.sessionId).pipe(
						Effect.mapError(
							() =>
								new ChatSessionNotFoundRpcError({
									sessionId: params.sessionId,
								}),
						),
					);

					// Fetch messages using cursor-based pagination
					const allMessages = yield* storage.chatMessages
						.getMessagesSince(params.sessionId, params.afterMessageId)
						.pipe(
							Effect.mapError(
								() =>
									new ChatSessionNotFoundRpcError({
										sessionId: params.sessionId,
									}),
							),
						);

					// Apply limit and determine hasMore
					const messages = allMessages.slice(0, limit);
					const hasMore = allMessages.length > limit;

					return new GetHistoryResult({ messages, hasMore });
				}),
		});
	}),
);

export const ChatRpcHandlersLive = ChatRpcHandlers.pipe(
	Layer.provide(SessionHubLive),
	Layer.provide(StorageServiceDefault),
);
