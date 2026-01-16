"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Repository, Worktree } from "@sandcastle/schemas";
import {
	IconChevronRight,
	IconDots,
	IconFolder,
	IconPinned,
	IconPinnedOff,
	IconPlus,
	IconTrash,
} from "@tabler/icons-react";
import * as Option from "effect/Option";
import * as React from "react";
import { worktreeListByRepositoryAtomFamily } from "@/api/worktree-atoms";
import { Button } from "@/components/button";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { Skeleton } from "@/components/skeleton";
import { Spinner } from "@/components/spinner";
import { cn } from "@/lib/utils";
import { SidebarWorktreeItem } from "./sidebar-worktree-item";

interface SidebarRepositoryItemProps {
	repository: Repository;
}

export function SidebarRepositoryItem({
	repository,
}: SidebarRepositoryItemProps) {
	const [isOpen, setIsOpen] = React.useState(true);
	const worktreesResult = useAtomValue(
		worktreeListByRepositoryAtomFamily(repository.id),
	);
	const worktrees = React.useMemo(
		() => Option.getOrElse(Result.value(worktreesResult), () => []),
		[worktreesResult],
	);
	const hasWorktreesCache = Option.isSome(Result.value(worktreesResult));

	function handleRepositoryDelete() {}
	function handleRepositoryPin() {}

	function handleWorktreeCreate() {}
	function handleWorktreeSelect() {}
	function handleWorktreeDelete() {}

	const isCreatingWorktree = false;

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<div className="group relative">
				<CollapsibleTrigger
					nativeButton={false}
					render={
						<SidebarMenuItem>
							<SidebarMenuButton className="aria-expanded:bg-transparent w-full justify-start gap-2 px-2 pr-7">
								<IconChevronRight
									className={cn(
										"text-muted-foreground size-4 shrink-0 transition-transform duration-150",
										isOpen && "rotate-90",
									)}
								/>
								<IconFolder className="text-muted-foreground size-4 shrink-0" />
								<span className="truncate text-sm">{repository.label}</span>
								{repository.pinned && (
									<IconPinned className="text-primary ml-auto size-3 shrink-0" />
								)}
							</SidebarMenuButton>
						</SidebarMenuItem>
					}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								size="icon-xs"
								className="absolute right-1 top-1/2 shrink-0 -translate-y-1/2 opacity-0 group-hover:opacity-100"
								onClick={(e) => e.stopPropagation()}
								aria-label="Project actions"
							>
								<IconDots className="size-3.5" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end" className="min-w-[160px]">
						<DropdownMenuItem
							onClick={(e) => {
								e.stopPropagation();
								handleRepositoryPin();
							}}
						>
							{repository.pinned ? (
								<IconPinnedOff className="size-4" />
							) : (
								<IconPinned className="size-4" />
							)}
							{repository.pinned ? "Unpin" : "Pin"}
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onSelect={(e) => {
								e.stopPropagation();
								handleRepositoryDelete();
							}}
						>
							<IconTrash className="size-4" />
							Remove from list
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<CollapsiblePanel className="ml-4 pl-2 space-y-0.5 py-1 border-l">
				<SidebarMenuItem>
					<SidebarMenuButton
						className="w-full justify-start gap-2 px-2 text-muted-foreground"
						onClick={handleWorktreeCreate}
						disabled={isCreatingWorktree}
					>
						<IconPlus className="text-muted-foreground size-3 shrink-0" />
						<span className="truncate text-sm">
							{isCreatingWorktree ? "Creating worktree..." : "New worktree"}
						</span>
						{isCreatingWorktree ? (
							<Spinner className="ml-auto size-3.5" />
						) : null}
					</SidebarMenuButton>
				</SidebarMenuItem>

				{Result.matchWithWaiting(worktreesResult, {
					onWaiting: () =>
						hasWorktreesCache ? (
							<WorktreeList worktrees={worktrees} />
						) : (
							<WorktreeListSkeleton />
						),
					onError: () =>
						hasWorktreesCache ? (
							<WorktreeList worktrees={worktrees} />
						) : (
							<WorktreeListError />
						),
					onDefect: () =>
						hasWorktreesCache ? (
							<WorktreeList worktrees={worktrees} />
						) : (
							<WorktreeListError />
						),
					onSuccess: () => <WorktreeList worktrees={worktrees} />,
				})}
			</CollapsiblePanel>
		</Collapsible>
	);
}

interface WorktreeListProps {
	worktrees: readonly Worktree[];
}

function WorktreeList({ worktrees }: WorktreeListProps) {
	return (
		<>
			{worktrees.map((worktree) => (
				<SidebarWorktreeItem
					key={`sidebar_${worktree.id}`}
					worktree={worktree}
				/>
			))}
		</>
	);
}

function WorktreeListSkeleton() {
	return (
		<div className="space-y-1 px-2 py-1">
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-full" />
		</div>
	);
}

function WorktreeListError() {
	return (
		<div className="text-destructive text-xs px-2 py-1">
			Failed to load worktrees
		</div>
	);
}
