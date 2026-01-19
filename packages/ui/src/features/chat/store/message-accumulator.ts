/**
 * Message Accumulator
 *
 * Accumulates ChatStreamEvents into a UIMessage.
 * This replicates the message building logic that AI SDK's useChat hook does internally,
 * allowing us to manage message state ourselves in a Zustand store.
 */

import type { ChatStreamEvent } from "@sandcastle/schemas";
import type { UIMessage } from "ai";

// Types for message parts that we build up during streaming
export type TextPart = {
	type: "text";
	text: string;
};

export type ReasoningPart = {
	type: "reasoning";
	reasoning: string;
};

export type ToolInvocationPart = {
	type: "dynamic-tool";
	toolCallId: string;
	toolName: string;
	input: unknown;
	inputText: string;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	output?: unknown;
	// Extended metadata
	title?: string;
	providerExecuted?: boolean;
	dynamic?: boolean;
};

export type FilePart = {
	type: "file";
	url: string;
	mediaType: string;
};

export type SourceUrlPart = {
	type: "source-url";
	sourceId: string;
	url: string;
	title?: string;
};

export type SourceDocumentPart = {
	type: "source-document";
	sourceId: string;
	mediaType: string;
	title: string;
	filename?: string;
};

export type UIMessagePart =
	| TextPart
	| ReasoningPart
	| ToolInvocationPart
	| FilePart
	| SourceUrlPart
	| SourceDocumentPart;

// Internal tracking state for streaming parts
interface TextPartState {
	index: number;
	text: string;
}

interface ReasoningPartState {
	index: number;
	text: string;
}

interface ToolPartState {
	index: number;
	inputText: string;
	toolName: string;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	title?: string;
	providerExecuted?: boolean;
	dynamic?: boolean;
}

/**
 * Accumulates streaming events into a complete UIMessage.
 * Create one instance per assistant turn.
 */
export class MessageAccumulator {
	private messageId: string;
	private parts: UIMessagePart[] = [];
	private textParts = new Map<string, TextPartState>();
	private reasoningParts = new Map<string, ReasoningPartState>();
	private toolParts = new Map<string, ToolPartState>();
	private metadata: Record<string, unknown> = {};

	constructor(messageId: string) {
		this.messageId = messageId;
	}

	/**
	 * Process a streaming event and update internal state.
	 */
	processEvent(event: ChatStreamEvent): void {
		switch (event.type) {
			case "start": {
				// May include initial metadata
				if (event.messageId) {
					this.messageId = event.messageId;
				}
				if (event.messageMetadata) {
					this.metadata = { ...this.metadata, ...event.messageMetadata };
				}
				break;
			}

			case "text-start": {
				const index = this.parts.length;
				this.textParts.set(event.id, { index, text: "" });
				this.parts.push({ type: "text", text: "" });
				break;
			}

			case "text-delta": {
				const state = this.textParts.get(event.id);
				if (state) {
					state.text += event.delta;
					(this.parts[state.index] as TextPart).text = state.text;
				}
				break;
			}

			case "text-end": {
				// Text part is finalized, no action needed
				break;
			}

			case "reasoning-start": {
				const index = this.parts.length;
				this.reasoningParts.set(event.id, { index, text: "" });
				this.parts.push({ type: "reasoning", reasoning: "" });
				break;
			}

			case "reasoning-delta": {
				const state = this.reasoningParts.get(event.id);
				if (state) {
					state.text += event.delta;
					(this.parts[state.index] as ReasoningPart).reasoning = state.text;
				}
				break;
			}

			case "reasoning-end": {
				// Reasoning part is finalized, no action needed
				break;
			}

			case "tool-input-start": {
				const index = this.parts.length;
				this.toolParts.set(event.toolCallId, {
					index,
					inputText: "",
					toolName: event.toolName,
					state: "input-streaming",
					title: event.title,
					providerExecuted: event.providerExecuted,
					dynamic: event.dynamic,
				});
				this.parts.push({
					type: "dynamic-tool",
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					input: {},
					inputText: "",
					state: "input-streaming",
					title: event.title,
					providerExecuted: event.providerExecuted,
					dynamic: event.dynamic,
				});
				break;
			}

			case "tool-input-delta": {
				const state = this.toolParts.get(event.toolCallId);
				if (state) {
					state.inputText += event.inputTextDelta;
					const part = this.parts[state.index] as ToolInvocationPart;
					part.inputText = state.inputText;
					// Try to parse partial JSON for preview
					try {
						part.input = JSON.parse(state.inputText);
					} catch {
						// Keep previous args if parse fails (partial JSON)
					}
				}
				break;
			}

			case "tool-input-available": {
				const state = this.toolParts.get(event.toolCallId);
				if (state) {
					state.state = "input-available";
					const part = this.parts[state.index] as ToolInvocationPart;
					part.state = "input-available";
					part.input = event.input;
					part.toolName = event.toolName;
					if (event.title) part.title = event.title;
					if (event.providerExecuted !== undefined)
						part.providerExecuted = event.providerExecuted;
					if (event.dynamic !== undefined) part.dynamic = event.dynamic;
				} else {
					// Tool input available without prior start (edge case)
					const index = this.parts.length;
					this.toolParts.set(event.toolCallId, {
						index,
						inputText: JSON.stringify(event.input),
						toolName: event.toolName,
						state: "input-available",
						title: event.title,
						providerExecuted: event.providerExecuted,
						dynamic: event.dynamic,
					});
					this.parts.push({
						type: "dynamic-tool",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						input: event.input,
						inputText: JSON.stringify(event.input),
						state: "input-available",
						title: event.title,
						providerExecuted: event.providerExecuted,
						dynamic: event.dynamic,
					});
				}
				break;
			}

			case "tool-input-error": {
				const state = this.toolParts.get(event.toolCallId);
				if (state) {
					state.state = "input-available";
					const part = this.parts[state.index] as ToolInvocationPart;
					part.state = "input-available";
					part.input = event.input;
				}
				break;
			}

			case "tool-output-available": {
				const state = this.toolParts.get(event.toolCallId);
				if (state) {
					state.state = "output-available";
					const part = this.parts[state.index] as ToolInvocationPart;
					part.state = "output-available";
					part.output = event.output;
				}
				break;
			}

			case "tool-output-error": {
				const state = this.toolParts.get(event.toolCallId);
				if (state) {
					state.state = "output-error";
					const part = this.parts[state.index] as ToolInvocationPart;
					part.state = "output-error";
					part.output = { error: event.errorText };
				}
				break;
			}

			case "tool-output-denied": {
				const state = this.toolParts.get(event.toolCallId);
				if (state) {
					state.state = "output-error";
					const part = this.parts[state.index] as ToolInvocationPart;
					part.state = "output-error";
					part.output = { denied: true };
				}
				break;
			}

			case "tool-approval-request": {
				// This is handled by the UI layer to show approval dialog
				// We don't modify message parts for this
				break;
			}

			case "file": {
				this.parts.push({
					type: "file",
					url: event.url,
					mediaType: event.mediaType,
				});
				break;
			}

			case "source-url": {
				this.parts.push({
					type: "source-url",
					sourceId: event.sourceId,
					url: event.url,
					title: event.title,
				});
				break;
			}

			case "source-document": {
				this.parts.push({
					type: "source-document",
					sourceId: event.sourceId,
					mediaType: event.mediaType,
					title: event.title,
					filename: event.filename,
				});
				break;
			}

			case "message-metadata": {
				this.metadata = { ...this.metadata, ...event.messageMetadata };
				break;
			}

			case "finish": {
				if (event.messageMetadata) {
					this.metadata = { ...this.metadata, ...event.messageMetadata };
				}
				break;
			}

			// Ignored events (handled elsewhere or not relevant to message building)
			case "start-step":
			case "finish-step":
			case "abort":
			case "error":
				break;

			default: {
				// Handle data-* events or unknown events
				// These can be stored in metadata if needed
				if (event.type.startsWith("data-")) {
					if (!event.transient) {
						this.metadata[event.type] = event.data;
					}
				}
				break;
			}
		}
	}

	/**
	 * Get the current accumulated message.
	 */
	getMessage(): UIMessage {
		return {
			id: this.messageId,
			role: "assistant",
			parts: this.parts as UIMessage["parts"],
			...(Object.keys(this.metadata).length > 0
				? { metadata: this.metadata }
				: {}),
		};
	}

	/**
	 * Get the message ID.
	 */
	getMessageId(): string {
		return this.messageId;
	}

	/**
	 * Reset the accumulator for a new message.
	 */
	reset(messageId: string): void {
		this.messageId = messageId;
		this.parts = [];
		this.textParts.clear();
		this.reasoningParts.clear();
		this.toolParts.clear();
		this.metadata = {};
	}

	/**
	 * Check if the accumulator has any content.
	 */
	hasContent(): boolean {
		return this.parts.length > 0;
	}
}
