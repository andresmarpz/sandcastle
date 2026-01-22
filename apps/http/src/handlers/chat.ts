import {
	ChatOperationRpcError,
	ChatRpc,
	ChatSessionNotFoundRpcError,
	GetHistoryResult,
	ToolApprovalNotFoundRpcError,
} from "@sandcastle/rpc";
import { StorageService, StorageServiceDefault } from "@sandcastle/storage";
import { Effect, Layer } from "effect";
import { GitService, GitServiceLive } from "../services/git";
import { SessionHub, SessionHubLive } from "../services/session-hub";

interface CreatePRContext {
	uncommittedChanges: number;
	currentBranch: string;
	targetBranch: string;
}

const buildCreatePRPrompt = (context: CreatePRContext): string => {
	return `The user likes the state of the code.

There are ${context.uncommittedChanges} uncommitted changes.
The current branch is ${context.currentBranch}
The target branch is ${context.targetBranch}

There is no upstream branch yet.
The user requested a PR.

Follow these exact steps to create a PR:

Run git diff to review uncommitted changes
Commit them. Follow any instructions the user gave you about writing commit messages.
Push to origin.
Use gh pr create --base ${context.targetBranch} to create a PR onto the target branch. Keep the title under 80 characters and the description under five sentences (unless the user has given you other instructions).
If any of these steps fail, ask the user for help.`;
};

export const ChatRpcHandlers = ChatRpc.toLayer(
	Effect.gen(function* () {
		const hub = yield* SessionHub;
		const storage = yield* StorageService;
		const git = yield* GitService;

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

			"chat.createPR": (params) =>
				Effect.gen(function* () {
					// Get session to retrieve workingPath
					const session = yield* storage.sessions.get(params.sessionId).pipe(
						Effect.mapError(
							() =>
								new ChatSessionNotFoundRpcError({
									sessionId: params.sessionId,
								}),
						),
					);

					// Get git context using GitService
					const [uncommittedChanges, currentBranch] = yield* Effect.all([
						git.getUncommittedChangesCount(session.workingPath),
						git.getCurrentBranch(session.workingPath),
					]).pipe(
						Effect.mapError(
							(e) =>
								new ChatOperationRpcError({
									message: `Failed to get git context: ${e.message}`,
								}),
						),
					);

					// Build the prompt with git context
					const prompt = buildCreatePRPrompt({
						uncommittedChanges,
						currentBranch,
						targetBranch: "main",
					});
					const clientMessageId = `create-pr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

					// Send the message to the session
					return yield* hub.sendMessage(
						params.sessionId,
						prompt,
						clientMessageId,
						undefined,
						"build",
					);
				}),
		});
	}),
);

export const ChatRpcHandlersLive = ChatRpcHandlers.pipe(
	Layer.provide(SessionHubLive),
	Layer.provide(StorageServiceDefault),
	Layer.provide(GitServiceLive),
);
