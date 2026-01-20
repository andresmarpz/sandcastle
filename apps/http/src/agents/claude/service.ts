import { Context, type Effect } from "effect";
import type { ClaudeSDKError } from "./errors";
import type { Options, QueryHandle } from "./types";

export interface ClaudeSDKServiceInterface {
	readonly query: (
		prompt: string,
		options: Options,
	) => Effect.Effect<QueryHandle, ClaudeSDKError>;
}

export class ClaudeSDKService extends Context.Tag("ClaudeSDKService")<
	ClaudeSDKService,
	ClaudeSDKServiceInterface
>() {}
