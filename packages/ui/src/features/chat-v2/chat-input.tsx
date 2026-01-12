"use client";

import type { ChatStatus } from "ai";
import { BotIcon, SquareIcon } from "lucide-react";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

interface ChatInputProps {
	onSend: (text: string) => void;
	onStop: () => void;
	status: ChatStatus;
	autonomous: boolean;
	onAutonomousChange: (autonomous: boolean) => void;
}

export function ChatInput({
	onSend,
	onStop,
	status,
	autonomous,
	onAutonomousChange,
}: ChatInputProps) {
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
					<PromptInputButton
						onClick={() => onAutonomousChange(!autonomous)}
						className={cn(
							autonomous && "bg-primary text-primary-foreground hover:bg-primary/90",
						)}
						title={autonomous ? "Autonomous mode ON" : "Autonomous mode OFF"}
					>
						<BotIcon className="h-4 w-4" />
						Autonomous
					</PromptInputButton>
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
