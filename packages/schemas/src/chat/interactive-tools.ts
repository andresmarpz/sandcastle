import { Either, Schema } from "effect";

/**
 * A single option in a question.
 */
export const AskUserQuestionOption = Schema.Struct({
	/** Display text for the option */
	label: Schema.String,
	/** Explanation of what this option means */
	description: Schema.optional(Schema.String),
});
export type AskUserQuestionOption = typeof AskUserQuestionOption.Type;

/**
 * A single question with options.
 */
export const AskUserQuestionQuestion = Schema.Struct({
	/** The complete question text */
	question: Schema.String,
	/** Short label displayed as a chip/tag (max 12 chars) */
	header: Schema.String,
	/** Available choices (2-4 options) */
	options: Schema.Array(AskUserQuestionOption),
	/** Whether multiple options can be selected */
	multiSelect: Schema.Boolean,
});
export type AskUserQuestionQuestion = typeof AskUserQuestionQuestion.Type;

/**
 * Input schema for AskUserQuestion tool (what Claude sends).
 * This matches the MCP tool definition in plan-mode-mcp-server.ts.
 */
export const AskUserQuestionInput = Schema.Struct({
	/** Array of questions to ask (1-4 questions) */
	questions: Schema.Array(AskUserQuestionQuestion),
	/** Pre-filled answers (optional, for tool call continuation) */
	answers: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.String }),
	),
	/** Optional metadata for tracking and analytics */
	metadata: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.Unknown }),
	),
});
export type AskUserQuestionInput = typeof AskUserQuestionInput.Type;

/**
 * Output schema for AskUserQuestion tool (what's in tool-output-available).
 * This is returned by the MCP handler after user responds.
 */
export const AskUserQuestionOutput = Schema.Struct({
	/** Echo back the questions for context */
	questions: Schema.Array(AskUserQuestionQuestion),
	/** User's answers keyed by question index ("0", "1", etc.) */
	answers: Schema.optional(
		Schema.Record({
			key: Schema.String,
			value: Schema.Union(Schema.String, Schema.Array(Schema.String)),
		}),
	),
});
export type AskUserQuestionOutput = typeof AskUserQuestionOutput.Type;

/**
 * MCP text content item format.
 */
const McpTextContent = Schema.Struct({
	type: Schema.Literal("text"),
	text: Schema.String,
});

/**
 * MCP tool output format (array of content items).
 */
const McpToolOutput = Schema.Array(McpTextContent);

/**
 * Parse AskUserQuestion tool output from various formats.
 * Handles:
 * - Direct AskUserQuestionOutput object
 * - JSON string containing AskUserQuestionOutput
 * - MCP content array with text items containing JSON
 *
 * @returns The parsed output or null if parsing fails
 */
export function parseAskUserQuestionOutput(
	output: unknown,
): AskUserQuestionOutput | null {
	if (!output) return null;

	// Try direct decode first
	const directResult = Schema.decodeUnknownEither(AskUserQuestionOutput)(
		output,
	);
	if (Either.isRight(directResult)) {
		return directResult.right;
	}

	// Try parsing as JSON string
	if (typeof output === "string") {
		try {
			const parsed = JSON.parse(output);
			const stringResult = Schema.decodeUnknownEither(AskUserQuestionOutput)(
				parsed,
			);
			if (Either.isRight(stringResult)) {
				return stringResult.right;
			}
		} catch {
			// Not valid JSON, continue to other formats
		}
	}

	// Try MCP content array format
	const mcpResult = Schema.decodeUnknownEither(McpToolOutput)(output);
	if (Either.isRight(mcpResult)) {
		const textItem = mcpResult.right.find((item) => item.type === "text");
		if (textItem) {
			try {
				const parsed = JSON.parse(textItem.text);
				const innerResult = Schema.decodeUnknownEither(AskUserQuestionOutput)(
					parsed,
				);
				if (Either.isRight(innerResult)) {
					return innerResult.right;
				}
			} catch {
				// Not valid JSON in text field
			}
		}
	}

	return null;
}

// ============================================================================
// ExitPlanMode Tool Schemas
// ============================================================================

/**
 * Allowed prompt entry for ExitPlanMode.
 */
export const ExitPlanModeAllowedPrompt = Schema.Struct({
	tool: Schema.Literal("Bash"),
	prompt: Schema.String,
});
export type ExitPlanModeAllowedPrompt = typeof ExitPlanModeAllowedPrompt.Type;

/**
 * Input schema for ExitPlanMode tool (what Claude sends).
 */
export const ExitPlanModeInput = Schema.Struct({
	/** The plan content in markdown */
	plan: Schema.optional(Schema.String),
	/** Allowed bash prompts for implementation */
	allowedPrompts: Schema.optional(Schema.Array(ExitPlanModeAllowedPrompt)),
	/** Whether to push to remote */
	pushToRemote: Schema.optional(Schema.Boolean),
	/** Remote session ID if pushed */
	remoteSessionId: Schema.optional(Schema.String),
	/** Remote session URL if pushed */
	remoteSessionUrl: Schema.optional(Schema.String),
});
export type ExitPlanModeInput = typeof ExitPlanModeInput.Type;
