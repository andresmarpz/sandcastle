"use client";

import type { useChat } from "@ai-sdk/react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useAtomValue } from "@effect-atom/atom-react";
import type { ChatStatus } from "ai";
import { BotIcon, FileIcon, SquareIcon } from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { type FileMatch, fileSearchAtomFamily } from "@/api/files-atoms";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/command";
import { cn } from "@/lib/utils";
import { useChatSessionContext } from "./context/chat-session-context";

// ─── Utilities ────────────────────────────────────────────────

/**
 * Splits a file path into directory and filename parts.
 * Used for rendering where directory can be truncated but filename is protected.
 */
function splitPath(path: string): {
	directory: string | null;
	filename: string;
} {
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash === -1) {
		return { directory: null, filename: path };
	}
	return {
		directory: path.slice(0, lastSlash),
		filename: path.slice(lastSlash + 1),
	};
}

/**
 * Custom hook for debouncing a value
 */
function useDebouncedValue<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => clearTimeout(timer);
	}, [value, delay]);

	return debouncedValue;
}

interface ChatInputProps {
	onSend: ReturnType<typeof useChat>["sendMessage"];
	onStop: () => void;
	status: ChatStatus;
	autonomous: boolean;
	onAutonomousChange: (autonomous: boolean) => void;
}

// ─── File Search Results Components ───────────────────────────

interface FileSearchResultsInnerProps {
	atom: ReturnType<typeof fileSearchAtomFamily>;
	onSelect: (path: string) => void;
}

function FileSearchResultsInner({
	atom,
	onSelect,
}: FileSearchResultsInnerProps) {
	const result = useAtomValue(atom);

	if (result._tag === "Initial") {
		return <CommandEmpty>Searching...</CommandEmpty>;
	}

	if (result._tag === "Failure") {
		return <CommandEmpty>Error searching files</CommandEmpty>;
	}

	// result._tag === "Success"
	if (result.value.length === 0) {
		return <CommandEmpty>No files found</CommandEmpty>;
	}

	return (
		<CommandGroup>
			{result.value.map((file: FileMatch) => {
				const { directory, filename } = splitPath(file.path);
				return (
					<CommandItem
						key={file.path}
						value={file.path}
						onSelect={() => onSelect(file.path)}
						title={file.path}
					>
						<FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="flex min-w-0">
							{directory && (
								<span className="truncate text-muted-foreground">
									{directory}/
								</span>
							)}
							<span className="shrink-0">{filename}</span>
						</span>
					</CommandItem>
				);
			})}
		</CommandGroup>
	);
}

interface FileSearchResultsProps {
	worktreeId: string;
	pattern: string;
	onSelect: (path: string) => void;
}

function FileSearchResults({
	worktreeId,
	pattern,
	onSelect,
}: FileSearchResultsProps) {
	const atom = useMemo(() => {
		if (!pattern || pattern.length === 0) return null;
		return fileSearchAtomFamily({ worktreeId, pattern });
	}, [worktreeId, pattern]);

	if (!atom) {
		return (
			<CommandEmpty className="text-xs text-muted-foreground">
				Type to search files...
			</CommandEmpty>
		);
	}

	return <FileSearchResultsInner atom={atom} onSelect={onSelect} />;
}

// ─── File Picker Popover ──────────────────────────────────────

interface FilePickerPopoverProps {
	worktreeId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (path: string) => void;
	anchorEl: HTMLElement | null;
}

function FilePickerPopover({
	worktreeId,
	open,
	onOpenChange,
	onSelect,
	anchorEl,
}: FilePickerPopoverProps) {
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search, 300);
	const inputRef = useRef<HTMLInputElement>(null);

	// Reset search when popover closes
	useEffect(() => {
		if (!open) {
			setSearch("");
		}
	}, [open]);

	// Focus input when popover opens
	useEffect(() => {
		if (open) {
			// Use multiple rAF to ensure DOM is ready
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					inputRef.current?.focus();
				});
			});
		}
	}, [open]);

	// Handle backspace when empty to close
	const handleKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Backspace" && search === "") {
				e.preventDefault();
				onOpenChange(false);
			}
		},
		[search, onOpenChange],
	);

	// Handle selection
	const handleSelect = useCallback(
		(path: string) => {
			onSelect(path);
			onOpenChange(false);
		},
		[onSelect, onOpenChange],
	);

	return (
		<PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
			{/* Hidden trigger - we control open state manually */}
			<PopoverPrimitive.Trigger
				className="hidden"
				aria-hidden="true"
				tabIndex={-1}
			/>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Positioner
					side="top"
					sideOffset={8}
					align="start"
					className="z-50"
					anchor={anchorEl}
				>
					<PopoverPrimitive.Popup
						className={cn(
							"w-80 rounded-lg border bg-popover shadow-lg",
							"data-open:animate-in data-closed:animate-out",
							"data-closed:fade-out-0 data-open:fade-in-0",
							"data-closed:zoom-out-95 data-open:zoom-in-95",
							"data-[side=top]:slide-in-from-bottom-2",
							"origin-(--transform-origin)",
						)}
					>
						<Command shouldFilter={false} className="rounded-lg">
							<CommandInput
								ref={inputRef}
								value={search}
								onValueChange={setSearch}
								onKeyDown={handleKeyDown}
								placeholder="Search files..."
							/>
							<CommandList className="max-h-60">
								<FileSearchResults
									worktreeId={worktreeId}
									pattern={debouncedSearch}
									onSelect={handleSelect}
								/>
							</CommandList>
						</Command>
					</PopoverPrimitive.Popup>
				</PopoverPrimitive.Positioner>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}

// ─── Chat Input ───────────────────────────────────────────────

export function ChatInput({
	onSend,
	onStop,
	status,
	autonomous,
	onAutonomousChange,
}: ChatInputProps) {
	const { worktreeId } = useChatSessionContext();
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
				onSend(text.trim());
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
