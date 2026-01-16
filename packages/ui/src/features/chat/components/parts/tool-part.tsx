import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@/components/ai-elements/tool";
import type { ToolCallPart } from "./index";

interface ToolPartProps {
	part: ToolCallPart;
}

// Extract tool name from part type or toolName property
function getToolName(part: ToolCallPart): string {
	if (part.type === "dynamic-tool") {
		return part.toolName ?? "unknown";
	}
	// For tool-* types, extract name from the type
	return part.type.replace("tool-", "");
}

// Map AI SDK state to Tool component state
function mapState(
	state: ToolCallPart["state"],
): "input-available" | "output-available" | "output-error" {
	switch (state) {
		case "input-streaming":
		case "input-available":
			return "input-available";
		case "output-available":
			return "output-available";
		case "output-error":
			return "output-error";
		default:
			return "input-available";
	}
}

export function ToolPart({ part }: ToolPartProps) {
	const toolName = getToolName(part);
	const toolType = `tool-${toolName}` as const;
	const mappedState = mapState(part.state);

	return (
		<Tool>
			<ToolHeader title={toolName} type={toolType} state={mappedState} />
			<ToolContent>
				<ToolInput input={part.input} />
				{part.output !== undefined && (
					<ToolOutput output={part.output} errorText={part.errorText} />
				)}
			</ToolContent>
		</Tool>
	);
}
