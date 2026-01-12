import type { UIMessage } from "ai";
import { ReadPart } from "./read-part";
import { ReasoningPart } from "./reasoning-part";
import { TextPart } from "./text-part";
import { TodoWritePart } from "./todo-write-part";
import { ToolPart } from "./tool-part";

// Use the part type from UIMessage to get correct inference
type MessagePart = UIMessage["parts"][number];

interface PartRendererProps {
	part: MessagePart;
}

export function PartRenderer({ part }: PartRendererProps) {
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

		return <ToolPart part={toolPart} />;
	}

	// Unknown part type - render as debug info
	return (
		<pre className="bg-muted text-muted-foreground rounded p-2 text-xs">
			{JSON.stringify(part, null, 2)}
		</pre>
	);
}

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
}
