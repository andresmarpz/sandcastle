"use client";

import type { Worktree } from "@sandcastle/rpc";
import { IconDots, IconGitBranch, IconTrash } from "@tabler/icons-react";
import * as React from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/alert-dialog";
import { Button } from "@/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

interface SidebarWorktreeItemProps {
	worktree: Worktree;
	onSelect: (worktree: Worktree) => void;
	onDelete: (worktree: Worktree) => void | Promise<void>;
	isDeleting?: boolean;
	className?: string;
}

function formatRelativeTime(iso: string) {
	const timestamp = Date.parse(iso);
	if (Number.isNaN(timestamp)) {
		return "unknown";
	}

	const diffMs = Date.now() - timestamp;
	const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
	const minutes = Math.floor(diffSeconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (diffSeconds < 60) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	if (weeks < 5) return `${weeks}w ago`;
	if (months < 12) return `${months}mo ago`;
	return `${years}y ago`;
}

export function SidebarWorktreeItem({
	worktree,
	onSelect,
	onDelete,
	isDeleting = false,
	className,
}: SidebarWorktreeItemProps) {
	const [isDialogOpen, setIsDialogOpen] = React.useState(false);
	const createdAtLabel = React.useMemo(
		() => formatRelativeTime(worktree.createdAt),
		[worktree.createdAt],
	);

	const handleDelete = async () => {
		await onDelete(worktree);
		setIsDialogOpen(false);
	};

	return (
		<>
			<div className={cn("group relative", className)}>
				<Button
					variant="ghost"
					size="sm"
					className="h-auto w-full items-start gap-2 px-2 py-2 pr-8 text-left"
					onClick={() => onSelect(worktree)}
				>
					<div className="flex w-full flex-col gap-1">
						<div className="flex items-center gap-2">
							<IconGitBranch className="text-muted-foreground size-4 shrink-0" />
							<span className="truncate text-sm font-medium">
								{worktree.branch}
							</span>
						</div>
						<div className="text-muted-foreground flex items-center gap-2 text-xs">
							<span className="truncate">{worktree.name}</span>
							<span aria-hidden="true">·</span>
							<span>{createdAtLabel}</span>
						</div>
					</div>
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-xs"
								className="absolute right-1 top-1/2 shrink-0 -translate-y-1/2 opacity-0 group-hover:opacity-100"
								onClick={(event) => event.stopPropagation()}
								aria-label="Worktree actions"
							>
								<IconDots className="size-3.5" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end" className="min-w-[160px]">
						<DropdownMenuItem
							variant="destructive"
							onClick={(event) => {
								event.stopPropagation();
								setIsDialogOpen(true);
							}}
							disabled={isDeleting}
						>
							<IconTrash className="size-4" />
							Delete worktree
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete worktree?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the worktree from disk and Sandcastle. Review any
							pending work in this worktree before deleting.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-6">
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting}
						>
							{isDeleting ? "Deleting..." : "Delete worktree"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
