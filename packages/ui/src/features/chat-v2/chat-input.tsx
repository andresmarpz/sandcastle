"use client";

import type { useChat } from "@ai-sdk/react";
import { IconRobot, IconSquare } from "@tabler/icons-react";
import type { ChatStatus } from "ai";
import { type ChangeEvent, useCallback, useRef, useState } from "react";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { useChatSessionContext } from "./context/chat-session-context";
import { FilePickerPopover } from "./file-search";

interface ChatInputProps {
	onSend: ReturnType<typeof useChat>["sendMessage"];
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
	const {
		config: { worktreeId },
	} = useChatSessionContext();
	const isStreaming = status === "streaming";
	const isSubmitted = status === "submitted";
	const isDisabled = isStreaming || isSubmitted;

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
			if (
				text.length > prevValue.length &&
				text[cursor - 1] === "@" &&
				!filePickerOpen
			) {
				setAtPosition(cursor - 1);
				setFilePickerOpen(true);
			}
		},
		[inputValue, filePickerOpen],
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

	// Handle form submission
	const handleSubmit = useCallback(
		({ text }: { text: string }) => {
			if (text.trim()) {
				onSend({ text });
				setInputValue("");
			}
		},
		[onSend],
	);

	return (
		<div ref={containerRef} className="relative border-t p-4">
			{/* File picker popover */}
			<FilePickerPopover
				worktreeId={worktreeId}
				open={filePickerOpen}
				onOpenChange={handleOpenChange}
				onSelect={handleFileSelect}
				anchorEl={containerRef.current}
			/>

			<PromptInput onSubmit={handleSubmit}>
				<PromptInputTextarea
					placeholder="Type a message... (Cmd+Enter to send)"
					disabled={isDisabled}
					onChange={handleTextChange}
					value={inputValue}
				/>
				<PromptInputFooter>
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
					{isStreaming ? (
						<PromptInputButton onClick={onStop} variant="destructive">
							<IconSquare className="h-4 w-4" />
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
