import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Layer, Stream } from "effect";
import { ClaudeSDKError } from "./errors";
import { ClaudeSDKService, type ClaudeSDKServiceInterface } from "./service";
import type { QueryHandle } from "./types";

const createQueryHandle = (q: ReturnType<typeof sdkQuery>): QueryHandle => ({
	stream: Stream.fromAsyncIterable(
		q,
		(e) => new ClaudeSDKError({ message: "Stream error", cause: e }),
	),
	interrupt: Effect.tryPromise({
		try: () => q.interrupt(),
		catch: (e) => new ClaudeSDKError({ message: "Interrupt failed", cause: e }),
	}),
	setModel: (model) =>
		Effect.tryPromise({
			try: () => q.setModel(model),
			catch: (e) =>
				new ClaudeSDKError({ message: "setModel failed", cause: e }),
		}),
	setPermissionMode: (mode) =>
		Effect.tryPromise({
			try: () => q.setPermissionMode(mode),
			catch: (e) =>
				new ClaudeSDKError({ message: "setPermissionMode failed", cause: e }),
		}),
	setMaxThinkingTokens: (tokens) =>
		Effect.tryPromise({
			try: () => q.setMaxThinkingTokens(tokens),
			catch: (e) =>
				new ClaudeSDKError({
					message: "setMaxThinkingTokens failed",
					cause: e,
				}),
		}),
});

export const makeClaudeSDKService = Effect.sync(
	(): ClaudeSDKServiceInterface => ({
		query: (prompt, options) =>
			Effect.try({
				try: () => {
					const q = sdkQuery({ prompt, options });
					return createQueryHandle(q);
				},
				catch: (e) => new ClaudeSDKError({ message: "Query failed", cause: e }),
			}),
	}),
);

export const ClaudeSDKServiceLive = Layer.effect(
	ClaudeSDKService,
	makeClaudeSDKService,
);
