"use client";

import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { Button } from "@/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import {
	CursorIcon,
	FinderIcon,
	VSCodeIcon,
} from "@/components/icons/editor-icons";
import { usePlatform } from "@/context/platform-context";

interface OpenPathButtonProps {
	path: string;
}

export function OpenPathButton({ path }: OpenPathButtonProps) {
	const { openInFileManager, openInEditor, openInVSCode, copyToClipboard } =
		usePlatform();

	const hasAnyAction =
		openInFileManager || openInEditor || openInVSCode || copyToClipboard;
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

	let itemIndex = 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="xs" className="gap-1 w-fit">
						Open
						<CaretDownIcon className="size-3" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="min-w-[220px]">
				{openInFileManager && (
					<DropdownMenuItem
						onClick={() => openInFileManager(path)}
						className="gap-3"
					>
						<span className="text-muted-foreground text-xs tabular-nums min-w-5 shrink-0">
							{++itemIndex}
						</span>
						<FinderIcon className="size-4 shrink-0" />
						Finder
					</DropdownMenuItem>
				)}
				{openInEditor && (
					<DropdownMenuItem
						onClick={() => openInEditor(path)}
						className="gap-3"
					>
						<span className="text-muted-foreground text-xs tabular-nums min-w-5 shrink-0">
							{++itemIndex}
						</span>
						<CursorIcon className="size-4 shrink-0" />
						Open in Cursor
					</DropdownMenuItem>
				)}
				{openInVSCode && (
					<DropdownMenuItem
						onClick={() => openInVSCode(path)}
						className="gap-3"
					>
						<span className="text-muted-foreground text-xs tabular-nums min-w-5 shrink-0">
							{++itemIndex}
						</span>
						<VSCodeIcon className="size-4 shrink-0" />
						Open in VS Code
					</DropdownMenuItem>
				)}
				<DropdownMenuItem onClick={handleCopyPath} className="gap-3">
					<span className="text-muted-foreground text-xs tabular-nums min-w-5 shrink-0">
						{++itemIndex}
					</span>
					<CopyIcon className="size-4 shrink-0" />
					Copy path
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
