import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Command, CommandInput, CommandList } from "@/components/command";
import { cn } from "@/lib/utils";
import { FileSearchResults } from "./file-search-results";
import { useDebouncedValue } from "./utils";

export interface FilePickerPopoverProps {
	worktreeId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (path: string) => void;
	anchorEl: HTMLElement | null;
}

export function FilePickerPopover({
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
