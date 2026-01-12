"use client";

import type { ChatStatus } from "ai";
import { SquareIcon } from "lucide-react";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

interface ChatInputProps {
	onSend: (text: string) => void;
	onStop: () => void;
	status: ChatStatus;
}

export function ChatInput({ onSend, onStop, status }: ChatInputProps) {
	const isStreaming = status === "streaming";
	const isSubmitted = status === "submitted";
	const isDisabled = isStreaming || isSubmitted;

	return (
		<div className="border-t p-4">
			<PromptInput
				onSubmit={({ text }) => {
					if (text.trim()) {
						onSend(text.trim());
					}
				}}
			>
				<PromptInputTextarea
					placeholder="Type a message... (Cmd+Enter to send)"
					disabled={isDisabled}
				/>
				<PromptInputFooter>
					<div /> {/* Spacer */}
					{isStreaming ? (
						<PromptInputButton onClick={onStop} variant="destructive">
							<SquareIcon className="h-4 w-4" />
							Stop
						</PromptInputButton>
					) : (
						<PromptInputSubmit status={status} disabled={isSubmitted} />
					)}
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
