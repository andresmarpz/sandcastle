"use client";

import { CaretDown, Copy } from "@phosphor-icons/react";
import { Button } from "@/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { usePlatform } from "@/context/platform-context";

function CursorIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 466.73 532.09" fill="currentColor" className={className}>
			<path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
		</svg>
	);
}

function FinderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 512 512" className={className}>
			<rect width="512" height="512" rx="15%" fill="url(#finder-grad-a)" />
			<defs>
				<linearGradient id="finder-grad-a" x2="0" y1="100%">
					<stop offset="0" stopColor="#1e73f2" />
					<stop offset="1" stopColor="#19d3fd" />
				</linearGradient>
				<linearGradient id="finder-grad-b" x2="0" y1="100%">
					<stop offset="0" stopColor="#dbe9f4" />
					<stop offset="1" stopColor="#f7f6f6" />
				</linearGradient>
			</defs>
			<path
				fill="url(#finder-grad-b)"
				d="M435.2 0H274.4c-21.2 49.2-59.2 129.6-60.8 283.4a9.9 9.9 0 0010 10.1h58.7a9.9 9.9 0 019.9 10.2A933.3 933.3 0 00311.3 512h123.9a76.8 76.8 0 0076.8-76.8V76.8A76.8 76.8 0 00435.2 0z"
			/>
			<path
				fill="none"
				stroke="#000000"
				strokeLinecap="round"
				strokeWidth="20"
				d="M371 149v34m-229-34v34m263.4 147.2a215.2 215.2 0 01-298.8 0"
			/>
		</svg>
	);
}

interface OpenPathButtonProps {
	path: string;
}

export function OpenPathButton({ path }: OpenPathButtonProps) {
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

	let itemIndex = 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="xs" className="gap-1 w-fit">
						Open
						<CaretDown className="size-3" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="min-w-[160px]">
				{openInFileManager && (
					<DropdownMenuItem onClick={() => openInFileManager(path)}>
						<span className="text-muted-foreground text-xs w-3">
							{++itemIndex}
						</span>
						<FinderIcon className="size-4" />
						Finder
					</DropdownMenuItem>
				)}
				{openInEditor && (
					<DropdownMenuItem onClick={() => openInEditor(path)}>
						<span className="text-muted-foreground text-xs w-3">
							{++itemIndex}
						</span>
						<CursorIcon className="size-4" />
						Cursor
					</DropdownMenuItem>
				)}
				<DropdownMenuItem onClick={handleCopyPath}>
					<span className="text-muted-foreground text-xs w-3">
						{++itemIndex}
					</span>
					<Copy className="size-4" />
					Copy path
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
