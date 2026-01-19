"use client";

import { IconRobot, IconSquare } from "@tabler/icons-react";
import type { ChatStatus, UIMessage } from "ai";
import { type ChangeEvent, useCallback, useRef, useState } from "react";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import type { SendResult } from "@/features/chat/store";
import { cn } from "@/lib/utils";
import { FilePickerPopover } from "./file-search";
import { PlanSelector } from "./plan-selector";

interface ChatInputProps {
	onSend: (options: {
		text: string;
		parts?: UIMessage["parts"];
	}) => Promise<SendResult>;
	onStop: () => void;
	status: ChatStatus;
	autonomous: boolean;
	onAutonomousChange: (autonomous: boolean) => void;
	workingPath?: string;
}

export function ChatInput({
	onSend,
	onStop,
	status,
	autonomous,
	onAutonomousChange,
	workingPath,
}: ChatInputProps) {
	const isStreaming = status === "streaming";
	// Track when we're waiting for server acknowledgment
	const [isSending, setIsSending] = useState(false);

	// File picker state
	const [filePickerOpen, setFilePickerOpen] = useState(false);
	const [atPosition, setAtPosition] = useState<number | null>(null);
	const [inputValue, setInputValue] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	// Detect @ character to open file picker
	const handleTextChange = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>) => {
			const text = e.currentTarget.value;
			const cursor = e.currentTarget.selectionStart;
			const prevValue = inputValue;

			// Store ref to textarea
			textareaRef.current = e.currentTarget;
			setInputValue(text);

			// Check if user just typed @ (text is longer and ends with @)
			// Only trigger file picker if workingPath is available
			if (
				workingPath &&
				text.length > prevValue.length &&
				text[cursor - 1] === "@" &&
				!filePickerOpen
			) {
				setAtPosition(cursor - 1);
				setFilePickerOpen(true);
			}
		},
		[inputValue, filePickerOpen, workingPath],
	);

	// Handle file selection - insert path into textarea
	const handleFileSelect = useCallback(
		(path: string) => {
			if (atPosition === null) return;

			// Replace the @ with @path (add space after for convenience)
			const beforeAt = inputValue.slice(0, atPosition);
			const afterAt = inputValue.slice(atPosition + 1); // Skip the @
			const newValue = `${beforeAt}@${path} ${afterAt}`;

			setInputValue(newValue);
			setAtPosition(null);

			// Focus back on textarea and set cursor position
			requestAnimationFrame(() => {
				if (textareaRef.current) {
					const newCursorPos = atPosition + path.length + 2; // +2 for @ and space
					textareaRef.current.focus();
					textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
				}
			});
		},
		[atPosition, inputValue],
	);

	// Handle popover close without selection
	const handleOpenChange = useCallback((open: boolean) => {
		setFilePickerOpen(open);
		if (!open) {
			setAtPosition(null);
			// Focus back on textarea
			requestAnimationFrame(() => {
				textareaRef.current?.focus();
			});
		}
	}, []);

	// Handle form submission - returns promise so PromptInput knows when to clear
	const handleSubmit = useCallback(
		async ({ text }: { text: string }) => {
			if (!text.trim()) return;

			setIsSending(true);
			try {
				await onSend({ text });
				setInputValue("");
			} finally {
				setIsSending(false);
			}
		},
		[onSend],
	);

	return (
		<div ref={containerRef} className="relative p-2 pt-0">
			{/* File picker popover - only available when workingPath is set */}
			{workingPath && (
				<FilePickerPopover
					workingPath={workingPath}
					open={filePickerOpen}
					onOpenChange={handleOpenChange}
					onSelect={handleFileSelect}
					anchorEl={containerRef.current}
				/>
			)}

			<PromptInput onSubmit={handleSubmit}>
				<PromptInputTextarea
					placeholder="Type a message... (Cmd+Enter to send)"
					disabled={isSending}
					onChange={handleTextChange}
					value={inputValue}
				/>
				<PromptInputFooter>
					<PlanSelector />
					<PromptInputButton
						onClick={() => onAutonomousChange(!autonomous)}
						className={cn(
							autonomous &&
								"bg-primary text-primary-foreground hover:bg-primary/90",
						)}
						title={autonomous ? "Autonomous mode ON" : "Autonomous mode OFF"}
					>
						<IconRobot className="h-4 w-4" />
						Autonomous
					</PromptInputButton>
					{isStreaming && (
						<PromptInputButton onClick={onStop} variant="destructive">
							<IconSquare className="h-4 w-4" />
							Stop
						</PromptInputButton>
					)}
					<PromptInputSubmit
						status={isSending ? "submitted" : "ready"}
						disabled={isSending}
					/>
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
