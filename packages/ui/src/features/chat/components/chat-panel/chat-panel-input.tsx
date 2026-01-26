import { CheckIcon } from "@phosphor-icons/react/Check";
import { PaperPlaneIcon } from "@phosphor-icons/react/PaperPlane";
import { PencilIcon } from "@phosphor-icons/react/Pencil";
import { SquareIcon } from "@phosphor-icons/react/Square";
import { XIcon } from "@phosphor-icons/react/X";
import type { ToolApprovalResponse } from "@sandcastle/schemas";
import {
	type ChangeEvent,
	memo,
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
import { cn } from "@/lib/utils";
import {
	useChatActions,
	useChatMode,
	useChatStatus,
	usePendingExitPlanApproval,
	useRespondToToolApproval,
	useSetChatMode,
} from "../../store";
import { FilePickerPopover } from "../file-search";
import { type Mode, PlanSelector } from "./plan-selector";

interface ChatPanelInputProps {
	sessionId: string;
	workingPath: string;
	autoFocus?: boolean;
}

export const ChatPanelInput = memo(function ChatPanelInput({
	sessionId,
	workingPath,
	autoFocus = false,
}: ChatPanelInputProps) {
	// Store hooks for state and actions
	const { sendMessage, stop } = useChatActions(sessionId);
	const status = useChatStatus(sessionId);
	const mode = useChatMode(sessionId);
	const setMode = useSetChatMode(sessionId);
	const pendingPlanApproval = usePendingExitPlanApproval(sessionId);
	const respondToToolApproval = useRespondToToolApproval(sessionId);

	// Derived state
	const isStreaming = status === "streaming";
	const hasPendingPlan = !!pendingPlanApproval;

	// Local state
	const [isSending, setIsSending] = useState(false);
	const [inputValue, setInputValue] = useState("");
	const [filePickerOpen, setFilePickerOpen] = useState(false);
	const [atPosition, setAtPosition] = useState<number | null>(null);

	// Refs
	const containerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-focus on mount
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
			const prevLength = inputValue.length;

			setInputValue(text);

			// Trigger file picker when user types @
			if (
				workingPath &&
				text.length > prevLength &&
				text[cursor - 1] === "@" &&
				!filePickerOpen
			) {
				setAtPosition(cursor - 1);
				setFilePickerOpen(true);
			}
		},
		[inputValue.length, filePickerOpen, workingPath],
	);

	// Handle file selection from picker
	const handleFileSelect = useCallback(
		(path: string) => {
			if (atPosition === null) return;

			const beforeAt = inputValue.slice(0, atPosition);
			const afterAt = inputValue.slice(atPosition + 1);
			const newValue = `${beforeAt}@${path} ${afterAt}`;

			setInputValue(newValue);
			setAtPosition(null);

			// Restore focus and cursor position
			requestAnimationFrame(() => {
				if (textareaRef.current) {
					const newCursorPos = atPosition + path.length + 2;
					textareaRef.current.focus();
					textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
				}
			});
		},
		[atPosition, inputValue],
	);

	// Handle file picker close
	const handleFilePickerOpenChange = useCallback((open: boolean) => {
		setFilePickerOpen(open);
		if (!open) {
			setAtPosition(null);
			requestAnimationFrame(() => {
				textareaRef.current?.focus();
			});
		}
	}, []);

	// Handle message submission
	const handleSubmit = useCallback(
		async ({ text }: { text: string }) => {
			if (!text.trim()) return;

			setIsSending(true);
			try {
				await sendMessage({ text, mode });
				setInputValue("");
			} finally {
				setIsSending(false);
			}
		},
		[sendMessage, mode],
	);

	// Plan approval handlers
	const handleApprovePlan = useCallback(() => {
		if (!pendingPlanApproval) return;

		const response: ToolApprovalResponse = {
			type: "tool-approval-response",
			toolCallId: pendingPlanApproval.toolCallId,
			toolName: pendingPlanApproval.toolName,
			approved: true,
			payload: { type: "ExitPlanModePayload" },
		};
		respondToToolApproval(response);
	}, [pendingPlanApproval, respondToToolApproval]);

	const handleRejectPlan = useCallback(() => {
		if (!pendingPlanApproval || !inputValue.trim()) return;

		const response: ToolApprovalResponse = {
			type: "tool-approval-response",
			toolCallId: pendingPlanApproval.toolCallId,
			toolName: pendingPlanApproval.toolName,
			approved: false,
			payload: {
				type: "ExitPlanModePayload",
				feedback: inputValue.trim(),
			},
		};
		respondToToolApproval(response);
		setInputValue("");
	}, [pendingPlanApproval, respondToToolApproval, inputValue]);

	const handleCancelPlan = useCallback(() => {
		if (!pendingPlanApproval) return;

		const response: ToolApprovalResponse = {
			type: "tool-approval-response",
			toolCallId: pendingPlanApproval.toolCallId,
			toolName: pendingPlanApproval.toolName,
			approved: false,
			payload: { type: "ExitPlanModePayload" },
		};
		respondToToolApproval(response);
	}, [pendingPlanApproval, respondToToolApproval]);

	const handleModeChange = useCallback(
		(newMode: Mode) => {
			setMode(newMode);
		},
		[setMode],
	);

	return (
		<div ref={containerRef} className="relative p-2 pt-0">
			{workingPath && (
				<FilePickerPopover
					workingPath={workingPath}
					open={filePickerOpen}
					onOpenChange={handleFilePickerOpenChange}
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
				/>
				<PromptInputFooter>
					<PromptInputTools>
						<PlanSelector
							value={mode}
							onValueChange={handleModeChange}
							disabled={hasPendingPlan}
						/>
					</PromptInputTools>
					<PromptInputActions>
						{hasPendingPlan ? (
							<>
								<Button variant="ghost" size="sm" onClick={handleCancelPlan}>
									<XIcon className="mr-1 size-4" />
									Cancel
								</Button>
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="outline"
													size="sm"
													onClick={handleRejectPlan}
													disabled={!inputValue.trim()}
													className="cursor-default disabled:pointer-events-none"
												/>
											}
										>
											<PencilIcon className="mr-1 size-4" />
											Request Changes
										</TooltipTrigger>
										<TooltipContent>
											{inputValue.trim()
												? "Send feedback to iterate on the plan"
												: "Type your feedback first"}
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
								<Button size="sm" onClick={handleApprovePlan}>
									<CheckIcon className="mr-1 size-4" />
									Approve
								</Button>
							</>
						) : isStreaming ? (
							<PromptInputButton
								onClick={stop}
								variant="destructive"
								title="Stop generation"
							>
								<SquareIcon className="size-4" />
							</PromptInputButton>
						) : (
							<PromptInputButton
								type="submit"
								size="icon-sm"
								title="Send message"
								variant="default"
								disabled={isSending || !inputValue.trim()}
							>
								<PaperPlaneIcon className="size-4" />
							</PromptInputButton>
						)}
					</PromptInputActions>
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
});
