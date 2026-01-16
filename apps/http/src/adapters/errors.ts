import { Data } from "effect";

/**
 * Error during stream transformation
 */
export class AdapterTransformError extends Data.TaggedError(
	"AdapterTransformError",
)<{
	readonly message: string;
	readonly cause?: unknown;
	readonly agentType: string;
}> {}

/**
 * Unsupported message type encountered
 */
export class UnsupportedMessageError extends Data.TaggedError(
	"UnsupportedMessageError",
)<{
	readonly messageType: string;
	readonly agentType: string;
}> {}
