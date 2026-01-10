import { Data } from "effect";

/**
 * Error thrown when word count is invalid (less than 1)
 */
export class InvalidWordCountError extends Data.TaggedError(
	"InvalidWordCountError",
)<{
	readonly wordCount: number;
	readonly message: string;
}> {}
