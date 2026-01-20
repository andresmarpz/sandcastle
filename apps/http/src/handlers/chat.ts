import {
	ChatRpc,
	ChatSessionNotFoundRpcError,
	GetHistoryResult,
	ToolApprovalNotFoundRpcError,
} from "@sandcastle/rpc";
import { StorageService, StorageServiceDefault } from "@sandcastle/storage";
import { Effect, Layer } from "effect";
import { SessionHub, SessionHubLive } from "../services/session-hub";

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
					params.mode,
				),

			"chat.interrupt": (params) => hub.interrupt(params.sessionId),

			"chat.dequeue": (params) =>
				hub.dequeueMessage(params.sessionId, params.messageId),

			"chat.getState": (params) => hub.getState(params.sessionId),

			"chat.getHistory": (params) =>
				Effect.gen(function* () {
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

					return new GetHistoryResult({ messages: allMessages });
				}),

			"chat.respondToToolApproval": (params) =>
				hub.respondToToolApproval(params.sessionId, params.response),
		});
	}),
);

export const ChatRpcHandlersLive = ChatRpcHandlers.pipe(
	Layer.provide(SessionHubLive),
	Layer.provide(StorageServiceDefault),
);
