"use client";

import { memo } from "react";
import { NativeMarkdownResponse } from "@/components/ai-elements/native-markdown";
import {
	Subagent,
	SubagentContent,
	SubagentHeader,
	SubagentOutput,
	SubagentPrompt,
} from "@/components/ai-elements/subagent";
import { type ToolStep, WorkUnit } from "./work-unit";

/**
 * Represents a Task tool invocation with its nested steps.
 */
export interface SubagentItem {
	type: "subagent";
	id: string;
	taskStep: ToolStep;
	prompt: string | null;
	nestedSteps: ToolStep[];
	responseText: string | null;
}

type SubagentStatus = "streaming" | "running" | "complete" | "error";

interface SubagentMessageProps {
	item: SubagentItem;
}

/**
 * Derive the subagent status from the Task tool step state.
 */
function deriveStatus(step: ToolStep): SubagentStatus {
	switch (step.state) {
		case "pending":
			return "streaming";
		case "running":
			return "running";
		case "complete":
			return "complete";
		case "error":
			return "error";
		default:
			return "running";
	}
}

/**
 * Extract the first text content from a tool output.
 * Handles both string output and array of content blocks.
 */
function extractFirstText(output: unknown): string | null {
	if (typeof output === "string") {
		return output;
	}

	if (Array.isArray(output)) {
		for (const block of output) {
			if (
				typeof block === "object" &&
				block !== null &&
				"type" in block &&
				block.type === "text" &&
				"text" in block &&
				typeof block.text === "string"
			) {
				return block.text;
			}
		}
	}

	return null;
}

/**
 * Renders a subagent with its prompt, nested tool calls, and response.
 */
export const SubagentMessage = memo(function SubagentMessage({
	item,
}: SubagentMessageProps) {
	const status = deriveStatus(item.taskStep);
	const input = item.taskStep.input as {
		description?: string;
		subagent_type?: string;
		prompt?: string;
	};

	const title = input.description ?? "Running subagent";
	const subagentType = input.subagent_type;

	// Extract prompt from Task tool input, fallback to item.prompt if provided
	const prompt = item.prompt ?? input.prompt ?? null;

	// Extract response from Task tool output (first text part), fallback to item.responseText
	const responseText =
		item.responseText ?? extractFirstText(item.taskStep.output);

	return (
		<Subagent status={status} defaultOpen={status === "running"}>
			<SubagentHeader title={title} subagentType={subagentType} />

			<SubagentContent>
				<div className="space-y-3 p-3">
					{/* Subagent Prompt - collapsible, closed by default */}
					{prompt && (
						<SubagentPrompt
							prompt={
								<NativeMarkdownResponse className="prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
									{prompt}
								</NativeMarkdownResponse>
							}
						/>
					)}

					{/* Nested Tool Calls */}
					{item.nestedSteps.length > 0 && <WorkUnit steps={item.nestedSteps} />}

					{/* Subagent Response */}
					{responseText && (
						<SubagentOutput
							output={
								<NativeMarkdownResponse className="prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
									{responseText}
								</NativeMarkdownResponse>
							}
						/>
					)}
				</div>
			</SubagentContent>
		</Subagent>
	);
});
