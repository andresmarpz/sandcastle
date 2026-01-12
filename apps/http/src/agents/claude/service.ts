import { Context, type Effect } from "effect";
import type { ClaudeSDKError } from "./errors";
import type { QueryHandle, QueryOptions } from "./types";

export interface ClaudeSDKServiceInterface {
	readonly query: (
		prompt: string,
		options: QueryOptions,
	) => Effect.Effect<QueryHandle, ClaudeSDKError>;
}

export class ClaudeSDKService extends Context.Tag("ClaudeSDKService")<
	ClaudeSDKService,
	ClaudeSDKServiceInterface
>() {}
