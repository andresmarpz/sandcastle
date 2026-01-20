"use client";

import { IconCheck, IconPencil, IconSquare, IconX } from "@tabler/icons-react";
import type { ChatStatus, UIMessage } from "ai";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	PromptInput,
	PromptInputActions,
	PromptInputButton,
	PromptInputFooter,
	PromptInputTextarea,
	PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/tooltip";
import type { SendResult, ToolApprovalRequest } from "@/features/chat/store";
import { cn } from "@/lib/utils";
import { FilePickerPopover } from "./file-search";
import { HarnessSelector } from "./harness-selector";
import { type Mode, PlanSelector } from "./plan-selector";

interface ChatInputProps {
	onSend: (options: {
		text: string;
		parts?: UIMessage["parts"];
		mode?: Mode;
	}) => Promise<SendResult>;
	onStop: () => void;
	status: ChatStatus;
	mode?: Mode;
	onModeChange?: (mode: Mode) => void;
	workingPath?: string;
	autoFocus?: boolean;
	pendingPlanApproval?: ToolApprovalRequest | null;
	onApprovePlan?: () => void;
	onRejectPlan?: (feedback: string) => void;
	onCancelPlan?: () => void;
}

export function ChatInput({
	onSend,
	onStop,
	status,
	mode,
	onModeChange,
	workingPath,
	autoFocus = false,
	pendingPlanApproval,
	onApprovePlan,
	onRejectPlan,
	onCancelPlan,
}: ChatInputProps) {
	const isStreaming = status === "streaming";
	const hasPendingPlan = !!pendingPlanApproval;
	// Track when we're waiting for server acknowledgment
	const [isSending, setIsSending] = useState(false);

	// File picker state
	const [filePickerOpen, setFilePickerOpen] = useState(false);
	const [atPosition, setAtPosition] = useState<number | null>(null);
	const [inputValue, setInputValue] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-focus on mount when autoFocus is true
	useEffect(() => {
		if (autoFocus && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [autoFocus]);

	// Detect @ character to open file picker
	const handleTextChange = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>) => {
			const text = e.currentTarget.value;
			const cursor = e.currentTarget.selectionStart;
			const prevValue = inputValue;

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
				await onSend({ text, mode });
				setInputValue("");
			} finally {
				setIsSending(false);
			}
		},
		[onSend, mode],
	);

	// Handle "Request Changes" for plan approval
	const handleRequestChanges = useCallback(() => {
		if (onRejectPlan && inputValue.trim()) {
			onRejectPlan(inputValue.trim());
			setInputValue("");
		}
	}, [onRejectPlan, inputValue]);

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

			<PromptInput
				onSubmit={hasPendingPlan ? () => {} : handleSubmit}
				className={cn(hasPendingPlan && "border-dashed")}
			>
				<PromptInputTextarea
					ref={textareaRef}
					placeholder={
						hasPendingPlan
							? "Describe changes you'd like to the plan..."
							: "Type a message... (Cmd+Enter to send)"
					}
					disabled={isSending}
					onChange={handleTextChange}
					value={inputValue}
					className={cn(hasPendingPlan && "border-dashed")}
				/>
				<PromptInputFooter>
					<PromptInputTools>
						<HarnessSelector />
						<PlanSelector
							value={mode}
							onValueChange={onModeChange}
							disabled={hasPendingPlan}
						/>
					</PromptInputTools>
					<PromptInputActions>
						{hasPendingPlan ? (
							<>
								<Button variant="ghost" size="sm" onClick={onCancelPlan}>
									<IconX className="size-4 mr-1" />
									Cancel
								</Button>
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="outline"
													size="sm"
													onClick={handleRequestChanges}
													disabled={!inputValue.trim()}
													className="disabled:pointer-events-none cursor-default"
												/>
											}
										>
											<IconPencil className="size-4 mr-1" />
											Request Changes
										</TooltipTrigger>
										<TooltipContent>
											{inputValue.trim()
												? "Send feedback to iterate on the plan"
												: "Type your feedback first"}
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<Button size="sm" onClick={onApprovePlan}>
									<IconCheck className="size-4 mr-1" />
									Approve
								</Button>
							</>
						) : (
							<>
								{isStreaming && (
									<PromptInputButton
										onClick={onStop}
										variant="destructive"
										title="Stop generation"
									>
										<IconSquare className="size-4" />
									</PromptInputButton>
								)}
								<Button
									type="submit"
									size="sm"
									disabled={isSending || !inputValue.trim()}
								>
									Send
								</Button>
							</>
						)}
					</PromptInputActions>
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
