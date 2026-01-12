import { Data } from "effect";

export class ClaudeSDKError extends Data.TaggedError("ClaudeSDKError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}
