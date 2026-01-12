import { Data } from "effect";

export class AdapterError extends Data.TaggedError("AdapterError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class StreamTransformError extends Data.TaggedError(
	"StreamTransformError",
)<{
	readonly message: string;
	readonly cause?: unknown;
}> {}
