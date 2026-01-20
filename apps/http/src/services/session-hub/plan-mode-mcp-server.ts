import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type {
	ChatStreamEvent,
	ToolApprovalResponse,
} from "@sandcastle/schemas";
import { z } from "zod";
import type { PendingToolRequest } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Timeout for user responses (5 minutes) */
const TOOL_RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Parameters for creating the plan mode MCP server */
export interface CreatePlanModeMcpServerParams {
	/** Map to store pending tool requests */
	readonly pendingRequests: Map<string, PendingToolRequest>;
	/** Function to emit stream events to subscribers */
	readonly emitEvent: (event: ChatStreamEvent) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the tool use ID from the extra parameter passed to MCP handlers.
 * Falls back to a generated UUID if not found.
 */
function extractToolUseId(extra: unknown): string {
	// The extra parameter may contain toolUseId in various structures
	if (extra && typeof extra === "object") {
		if ("toolUseId" in extra && typeof extra.toolUseId === "string") {
			return extra.toolUseId;
		}
		// Check nested structures
		if (
			"context" in extra &&
			typeof extra.context === "object" &&
			extra.context !== null
		) {
			const context = extra.context as Record<string, unknown>;
			if ("toolUseId" in context && typeof context.toolUseId === "string") {
				return context.toolUseId;
			}
		}
	}
	// Fallback to generated ID
	return crypto.randomUUID();
}

/**
 * Create a timeout promise that rejects after the specified duration.
 */
function createTimeout(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error(`Tool response timeout after ${ms}ms`));
		}, ms);
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an MCP server with handlers for AskUserQuestion and ExitPlanMode.
 *
 * These handlers intercept Claude's interactive tools and:
 * 1. Emit a tool-approval-request event to the UI
 * 2. Await a Promise that resolves when the user responds
 * 3. Return the result to Claude
 */
export function createPlanModeMcpServer(params: CreatePlanModeMcpServerParams) {
	const { pendingRequests, emitEvent } = params;

	return createSdkMcpServer({
		name: "plan-mode-ui",
		version: "1.0.0",
		tools: [
			// ─── AskUserQuestion Handler ──────────────────────────────────────────
			tool(
				"AskUserQuestion",
				"Ask the user questions to gather information",
				{
					questions: z
						.array(
							z.object({
								question: z.string(),
								header: z.string().max(12),
								options: z
									.array(
										z.object({
											label: z.string(),
											description: z.string(),
										}),
									)
									.min(2)
									.max(4),
								multiSelect: z.boolean(),
							}),
						)
						.min(1)
						.max(4),
					answers: z.record(z.string(), z.string()).optional(),
					metadata: z.record(z.string(), z.unknown()).optional(),
				},
				async (args, extra) => {
					const toolUseId = extractToolUseId(extra);
					const toolName = "AskUserQuestion";

					// Create deferred promise
					const { promise, resolve, reject } =
						Promise.withResolvers<ToolApprovalResponse>();

					// Store pending request
					pendingRequests.set(toolUseId, {
						resolve,
						reject,
						createdAt: Date.now(),
						toolName,
					});

					// Emit event to UI
					emitEvent({
						type: "tool-approval-request",
						toolCallId: toolUseId,
						toolName,
						input: args,
					});

					try {
						// Wait for user response with timeout
						const response = await Promise.race([
							promise,
							createTimeout(TOOL_RESPONSE_TIMEOUT_MS),
						]);

						// Format response for Claude
						if (
							response.approved &&
							response.payload?.type === "AskUserQuestionPayload"
						) {
							return {
								content: [
									{
										type: "text" as const,
										text: JSON.stringify({
											questions: args.questions,
											answers: response.payload.answers,
										}),
									},
								],
							};
						}

						// User denied or no payload
						return {
							content: [
								{
									type: "text" as const,
									text: "User declined to answer the questions.",
								},
							],
							isError: true,
						};
					} catch (error) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Error: ${error instanceof Error ? error.message : String(error)}`,
								},
							],
							isError: true,
						};
					} finally {
						pendingRequests.delete(toolUseId);
					}
				},
			),

			// ─── ExitPlanMode Handler ─────────────────────────────────────────────
			tool(
				"ExitPlanMode",
				"Signal that the plan is ready for user approval",
				{
					allowedPrompts: z
						.array(
							z.object({
								tool: z.enum(["Bash"]),
								prompt: z.string(),
							}),
						)
						.optional(),
					pushToRemote: z.boolean().optional(),
					remoteSessionId: z.string().optional(),
					remoteSessionUrl: z.string().optional(),
				},
				async (args, extra) => {
					const toolUseId = extractToolUseId(extra);
					const toolName = "ExitPlanMode";

					// Create deferred promise
					const { promise, resolve, reject } =
						Promise.withResolvers<ToolApprovalResponse>();

					// Store pending request
					pendingRequests.set(toolUseId, {
						resolve,
						reject,
						createdAt: Date.now(),
						toolName,
					});

					// Emit event to UI
					emitEvent({
						type: "tool-approval-request",
						toolCallId: toolUseId,
						toolName,
						input: args,
					});

					try {
						// Wait for user response with timeout
						const response = await Promise.race([
							promise,
							createTimeout(TOOL_RESPONSE_TIMEOUT_MS),
						]);

						// Format response for Claude
						if (response.approved) {
							return {
								content: [
									{
										type: "text" as const,
										text: "Plan approved by user. Proceeding with implementation.",
									},
								],
							};
						}

						// Plan rejected - include feedback if provided
						const feedback =
							response.payload?.type === "ExitPlanModePayload" &&
							response.payload.feedback
								? response.payload.feedback
								: "No feedback provided.";

						return {
							content: [
								{
									type: "text" as const,
									text: `Plan rejected. User feedback: ${feedback}`,
								},
							],
						};
					} catch (error) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Error: ${error instanceof Error ? error.message : String(error)}`,
								},
							],
							isError: true,
						};
					} finally {
						pendingRequests.delete(toolUseId);
					}
				},
			),
		],
	});
}
