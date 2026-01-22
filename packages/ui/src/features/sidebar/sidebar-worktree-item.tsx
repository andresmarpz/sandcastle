"use client";

import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import type { Worktree } from "@sandcastle/schemas";
import { formatDistanceToNow } from "date-fns";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
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
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { cn } from "@/lib/utils";

interface SidebarWorktreeItemProps {
	worktree: Worktree;
}

function formatRelativeTime(iso: string) {
	const timestamp = Date.parse(iso);
	if (Number.isNaN(timestamp)) {
		return "unknown";
	}
	return formatDistanceToNow(timestamp, {
		addSuffix: true,
	});
}

export function SidebarWorktreeItem({ worktree }: SidebarWorktreeItemProps) {
	const location = useLocation();
	const navigate = useNavigate();

	const [isDialogOpen, setIsDialogOpen] = React.useState(false);
	const createdAtLabel = React.useMemo(
		() => formatRelativeTime(worktree.createdAt),
		[worktree.createdAt],
	);

	const handleDelete = async () => {
		// Missing: delete using RPC
		setIsDialogOpen(false);
	};

	const isActive = location.pathname.startsWith(`/worktree/${worktree.id}`);

	function handleSelect() {
		navigate(`/worktree/${worktree.id}`);
	}

	return (
		<>
			<SidebarMenuItem className={cn("group relative")}>
				<SidebarMenuButton
					className="h-auto w-full items-start gap-2 px-2 py-2 pr-8 text-left"
					onClick={handleSelect}
					isActive={isActive}
				>
					<div className="flex w-full flex-col gap-1">
						<div className="flex items-center gap-2">
							<GitBranchIcon className="text-muted-foreground size-4 shrink-0" />
							<span className="truncate text-sm font-medium">
								{worktree.branch}
							</span>
						</div>
						<div className="text-muted-foreground flex items-center gap-2 text-xs">
							<span className="whitespace-nowrap">{worktree.name}</span>
							<span aria-hidden="true">·</span>
							<span className="truncate">{createdAtLabel}</span>
						</div>
					</div>
				</SidebarMenuButton>

				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-xs"
								className="absolute right-1 top-1/2 shrink-0 -translate-y-1/2 opacity-100"
								onClick={(event) => event.stopPropagation()}
								aria-label="Worktree actions"
							>
								<DotsThreeIcon className="size-3.5" />
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
						>
							<TrashIcon className="size-4" />
							Delete worktree
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>

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
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDelete}>
							Delete worktree
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
