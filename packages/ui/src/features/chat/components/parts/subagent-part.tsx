"use client";

import { Streamdown } from "streamdown";
import {
	Subagent,
	SubagentContent,
	SubagentHeader,
	SubagentOutput,
} from "@/components/ai-elements/subagent";
import {
	getToolName,
	getToolTitle,
	type WorkStep as WorkStepType,
} from "../group-messages";
import { getToolIcon, WorkStep } from "../work-step";
import type { ToolCallPart } from "./index";

type SubagentStatus = "streaming" | "running" | "complete" | "error";

interface SubagentPartProps {
	taskPart: ToolCallPart;
	nestedSteps: WorkStepType[];
}

/**
 * Derive the subagent status from the Task tool part state.
 */
function deriveSubagentStatus(part: ToolCallPart): SubagentStatus {
	switch (part.state) {
		case "input-streaming":
			return "streaming";
		case "input-available":
			return "running";
		case "output-available":
			return "complete";
		case "output-error":
			return "error";
		default:
			return "running";
	}
}

/**
 * Extract the text output from the Task tool result.
 * The output is typically an array with text parts.
 * Filters out the agentId metadata text (e.g., "agentId: a9cc02b (for resuming...)")
 */
function extractSubagentOutput(output: unknown): string | null {
	if (!output) return null;

	// Handle array output format: [{ type: "text", text: "..." }, ...]
	if (Array.isArray(output)) {
		const textParts = output
			.filter(
				(item): item is { type: string; text: string } =>
					typeof item === "object" &&
					item !== null &&
					"type" in item &&
					item.type === "text" &&
					"text" in item &&
					typeof item.text === "string",
			)
			.map((item) => item.text)
			// Filter out the agentId metadata line
			.filter((text) => !text.startsWith("agentId:"));

		if (textParts.length > 0) {
			return textParts.join("\n\n");
		}
	}

	// Handle string output
	if (typeof output === "string") {
		// Filter out agentId line if it's the entire string
		if (output.startsWith("agentId:")) {
			return null;
		}
		return output;
	}

	return null;
}

export function SubagentPart({ taskPart, nestedSteps }: SubagentPartProps) {
	const status = deriveSubagentStatus(taskPart);
	const input = taskPart.input as
		| { description?: string; subagent_type?: string; prompt?: string }
		| undefined;

	const title = input?.description || "Running subagent";
	const subagentType = input?.subagent_type;
	const outputText = extractSubagentOutput(taskPart.output);

	return (
		<div className="py-px">
			<Subagent status={status} defaultOpen={status === "running"}>
				<SubagentHeader title={title} subagentType={subagentType} />

				{nestedSteps.length > 0 && (
					<SubagentContent>
						<div className="space-y-3 [&>*:last-child_.work-step-line]:hidden">
							{nestedSteps.map((step) => {
								const toolName = getToolName(step.part);
								const Icon = getToolIcon(toolName);
								const stepTitle = getToolTitle(step.part);

								return (
									<WorkStep
										key={step.part.toolCallId}
										icon={Icon}
										title={stepTitle}
									/>
								);
							})}
						</div>
					</SubagentContent>
				)}

				{outputText && (
					<SubagentOutput
						output={
							<Streamdown className="prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
								{outputText}
							</Streamdown>
						}
					/>
				)}
			</Subagent>
		</div>
	);
}
