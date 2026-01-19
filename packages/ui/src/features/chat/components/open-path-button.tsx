"use client";

import { Button } from "@/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { usePlatform } from "@/context/platform-context";
import {
	IconChevronDown,
	IconCopy,
	IconFolder,
	IconPointer,
} from "@tabler/icons-react";

interface OpenPathButtonProps {
	path: string;
	size?: "default" | "sm" | "lg" | "icon" | "icon-xs" | "xs";
}

export function OpenPathButton({ path, size = "xs" }: OpenPathButtonProps) {
	const { openInFileManager, openInEditor, copyToClipboard } = usePlatform();

	// If no platform actions are available, don't render the button
	const hasAnyAction = openInFileManager || openInEditor || copyToClipboard;
	if (!hasAnyAction) {
		return null;
	}

	const handleCopyPath = async () => {
		if (copyToClipboard) {
			await copyToClipboard(path);
		} else {
			// Fallback to navigator.clipboard
			await navigator.clipboard.writeText(path);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size={size} className="gap-1">
						Open
						<IconChevronDown className="size-3" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="min-w-[160px]">
				{openInFileManager && (
					<DropdownMenuItem onClick={() => openInFileManager(path)}>
						<IconFolder className="size-4" />
						Finder
					</DropdownMenuItem>
				)}
				{openInEditor && (
					<DropdownMenuItem onClick={() => openInEditor(path)}>
						<IconPointer className="size-4" />
						Cursor
					</DropdownMenuItem>
				)}
				<DropdownMenuItem onClick={handleCopyPath}>
					<IconCopy className="size-4" />
					Copy path
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
