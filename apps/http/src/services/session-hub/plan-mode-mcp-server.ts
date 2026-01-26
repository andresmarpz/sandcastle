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
	/** Session ID (required for RenameSession tool) */
	readonly sessionId?: string;
	/** Callback to update session title (only provided on first message) */
	readonly updateSessionTitle?: (title: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the tool use ID from the extra parameter passed to MCP handlers.
 * Throws if not found, since we cannot match approvals without it.
 */
function extractToolUseId(extra: unknown): string {
	if (extra && typeof extra === "object" && "_meta" in extra) {
		const meta = extra._meta;
		if (meta && typeof meta === "object" && "claudecode/toolUseId" in meta) {
			const toolUseId = (meta as Record<string, unknown>)[
				"claudecode/toolUseId"
			];
			if (typeof toolUseId === "string") {
				return toolUseId;
			}
		}
	}
	throw new Error(
		"Failed to extract toolUseId from MCP handler extra parameter. " +
			"Cannot process tool approval without a valid toolUseId.",
	);
}

/**
 * Custom error for plan approval timeouts with user-friendly message.
 */
class PlanApprovalTimeoutError extends Error {
	constructor(timeoutMs: number) {
		const timeoutMinutes = Math.round(timeoutMs / 60000);
		super(
			`Plan approval timed out after ${timeoutMinutes} minute${timeoutMinutes !== 1 ? "s" : ""}. ` +
				"The plan was not approved in time. Please try again. If this persists, please file an issue.",
		);
		this.name = "PlanApprovalTimeoutError";
	}
}

/**
 * Create a timeout promise that rejects after the specified duration.
 */
function createTimeout(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new PlanApprovalTimeoutError(ms));
		}, ms);
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an MCP server with handlers for AskUserQuestion, ExitPlanMode, and optionally RenameSession.
 *
 * These handlers intercept Claude's interactive tools and:
 * 1. Emit a tool-approval-request event to the UI
 * 2. Await a Promise that resolves when the user responds
 * 3. Return the result to Claude
 *
 * RenameSession is a special tool that runs silently on first message to auto-generate session title.
 */
export function createPlanModeMcpServer(params: CreatePlanModeMcpServerParams) {
	const { pendingRequests, emitEvent, sessionId, updateSessionTitle } = params;

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

					// Store pending request (input is available from tool-input-available event)
					pendingRequests.set(toolUseId, {
						toolCallId: toolUseId,
						toolName,
						createdAt: Date.now(),
						resolve,
						reject,
					});

					// Emit event to UI
					emitEvent({
						type: "tool-approval-request",
						toolCallId: toolUseId,
						toolName,
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
					// Note: These fields match Claude Code's built-in ExitPlanMode tool definition
					// Claude sends the plan content when calling this tool
					plan: z.string().optional(),
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

					// Store pending request (input is available from tool-input-available event)
					pendingRequests.set(toolUseId, {
						toolCallId: toolUseId,
						toolName,
						createdAt: Date.now(),
						resolve,
						reject,
					});

					// Emit event to UI
					emitEvent({
						type: "tool-approval-request",
						toolCallId: toolUseId,
						toolName,
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

			// ─── RenameSession Handler (only available on first message) ────────────
			...(sessionId && updateSessionTitle
				? [
						tool(
							"RenameSession",
							"Rename the current session with a concise title",
							{
								title: z.string().min(1).max(100),
							},
							async (args) => {
								try {
									await updateSessionTitle(args.title);

									// Emit event to UI so it can update cached session data
									emitEvent({
										type: "session-renamed",
										sessionId,
										title: args.title,
									});

									return {
										content: [
											{
												type: "text" as const,
												text: "Session renamed successfully.",
											},
										],
									};
								} catch (error) {
									return {
										content: [
											{
												type: "text" as const,
												text: `Failed to rename session: ${error instanceof Error ? error.message : String(error)}`,
											},
										],
										isError: true,
									};
								}
							},
						),
					]
				: []),
		],
	});
}
