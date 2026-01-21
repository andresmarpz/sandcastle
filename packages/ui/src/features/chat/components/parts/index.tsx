import type { UIMessage } from "ai";
import { memo } from "react";
import { isAskUserQuestionTool, isExitPlanModeTool } from "../group-messages";
import { BashPart } from "./bash-part";
import { EditPart } from "./edit-part";
import { GlobPart } from "./glob-part";
import { GrepPart } from "./grep-part";
import { PlanPart } from "./plan-part";
import { QuestionsPart } from "./questions-part";
import { ReadPart } from "./read-part";
import { ReasoningPart } from "./reasoning-part";
import { TextPart } from "./text-part";
import { TodoWritePart } from "./todo-write-part";
import { ToolPart } from "./tool-part";
import { WritePart } from "./write-part";

// Use the part type from UIMessage to get correct inference
type MessagePart = UIMessage["parts"][number];

interface PartRendererProps {
	part: MessagePart;
	sessionId?: string;
}

function arePartsEqual(
	prev: PartRendererProps,
	next: PartRendererProps,
): boolean {
	// Check sessionId equality first
	if (prev.sessionId !== next.sessionId) return false;

	const p = prev.part;
	const n = next.part;

	if (p.type !== n.type) return false;

	if (p.type === "text" && n.type === "text") {
		return p.text === n.text;
	}

	if (p.type === "reasoning" && n.type === "reasoning") {
		return p.text === n.text && p.state === n.state;
	}

	// Tool parts: compare by toolCallId and state
	if (p.type.startsWith("tool-") || p.type === "dynamic-tool") {
		const pTool = p as ToolCallPart;
		const nTool = n as ToolCallPart;
		return pTool.toolCallId === nTool.toolCallId && pTool.state === nTool.state;
	}

	return false;
}

export const PartRenderer = memo(function PartRenderer({
	part,
	sessionId,
}: PartRendererProps) {
	if (part.type === "text") {
		return <TextPart text={part.text} />;
	}

	if (part.type === "reasoning") {
		return (
			<ReasoningPart
				reasoning={part.text}
				isStreaming={part.state === "streaming"}
			/>
		);
	}

	// Handle tool parts (both static tool-* and dynamic-tool types)
	if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
		const toolPart = part as ToolCallPart;

		// Use dedicated component for ExitPlanMode (plan approval)
		// Handles both direct name and MCP-prefixed name (mcp__plan-mode-ui__ExitPlanMode)
		if (
			part.type === "tool-ExitPlanMode" ||
			(part.type === "dynamic-tool" &&
				toolPart.toolName &&
				isExitPlanModeTool(toolPart.toolName))
		) {
			// PlanPart requires sessionId for approval state hooks
			if (sessionId) {
				return <PlanPart part={toolPart} sessionId={sessionId} />;
			}
			// Fallback to generic tool part if no sessionId
			return <ToolPart part={toolPart} />;
		}

		// Use dedicated component for AskUserQuestion (inline questions)
		// Handles both direct name and MCP-prefixed name
		if (
			part.type === "tool-AskUserQuestion" ||
			(part.type === "dynamic-tool" &&
				toolPart.toolName &&
				isAskUserQuestionTool(toolPart.toolName))
		) {
			// QuestionsPart requires sessionId for approval state hooks
			if (sessionId) {
				return <QuestionsPart part={toolPart} sessionId={sessionId} />;
			}
			// Fallback to generic tool part if no sessionId
			return <ToolPart part={toolPart} />;
		}

		// Use dedicated component for TodoWrite
		if (
			part.type === "tool-TodoWrite" ||
			(part.type === "dynamic-tool" && toolPart.toolName === "TodoWrite")
		) {
			return <TodoWritePart part={toolPart} />;
		}

		// Use dedicated component for Read
		if (
			part.type === "tool-Read" ||
			(part.type === "dynamic-tool" && toolPart.toolName === "Read")
		) {
			return <ReadPart part={toolPart} />;
		}

		// Use dedicated component for Write
		if (
			part.type === "tool-Write" ||
			(part.type === "dynamic-tool" && toolPart.toolName === "Write")
		) {
			return <WritePart part={toolPart} />;
		}

		// Use dedicated component for Edit
		if (
			part.type === "tool-Edit" ||
			(part.type === "dynamic-tool" && toolPart.toolName === "Edit")
		) {
			return <EditPart part={toolPart} />;
		}

		// Use dedicated component for Bash
		if (
			part.type === "tool-Bash" ||
			(part.type === "dynamic-tool" && toolPart.toolName === "Bash")
		) {
			return <BashPart part={toolPart} />;
		}

		// Use dedicated component for Glob
		if (
			part.type === "tool-Glob" ||
			(part.type === "dynamic-tool" && toolPart.toolName === "Glob")
		) {
			return <GlobPart part={toolPart} />;
		}

		// Use dedicated component for Grep
		if (
			part.type === "tool-Grep" ||
			(part.type === "dynamic-tool" && toolPart.toolName === "Grep")
		) {
			return <GrepPart part={toolPart} />;
		}

		return <ToolPart part={toolPart} />;
	}

	// Unknown part type - render as debug info
	return (
		<pre className="bg-muted text-muted-foreground rounded p-2 text-xs">
			{JSON.stringify(part, null, 2)}
		</pre>
	);
}, arePartsEqual);

// Type helper for tool parts - matches AI SDK UIToolInvocation states
export interface ToolCallPart {
	type: `tool-${string}` | "dynamic-tool";
	toolCallId: string;
	toolName?: string; // Only on dynamic-tool type
	title?: string;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	input?: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
	/** For tools requiring approval (e.g., ExitPlanMode): whether the user approved */
	approved?: boolean;
	/** For tools requiring approval: user feedback when rejecting */
	feedback?: string;
	/** Parent tool call ID - links this tool to its parent subagent (Task tool) */
	parentToolCallId?: string | null;
}
