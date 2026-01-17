"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
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
import {
	deleteRepositoryMutation,
	REPOSITORY_LIST_KEY,
} from "@/api/repository-atoms";
import {
	createWorktreeMutation,
	WORKTREE_LIST_KEY,
	worktreeListByRepositoryAtomFamily,
} from "@/api/worktree-atoms";
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
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
	const [deleteResult, deleteRepository] = useAtom(deleteRepositoryMutation);
	const isDeleting = deleteResult.waiting;
	const [createWorktreeResult, createWorktree] = useAtom(
		createWorktreeMutation,
	);
	const isCreatingWorktree = createWorktreeResult.waiting;

	const worktreesResult = useAtomValue(
		worktreeListByRepositoryAtomFamily(repository.id),
	);
	const worktrees = React.useMemo(
		() => Option.getOrElse(Result.value(worktreesResult), () => []),
		[worktreesResult],
	);
	const hasWorktreesCache = Option.isSome(Result.value(worktreesResult));

	function handleRepositoryDelete() {
		deleteRepository({
			payload: { id: repository.id },
			reactivityKeys: [REPOSITORY_LIST_KEY],
		});
		setIsDeleteDialogOpen(false);
	}
	function handleRepositoryPin() {}

	function handleWorktreeCreate() {
		createWorktree({
			payload: { repositoryId: repository.id },
			reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:repo:${repository.id}`],
		});
	}
	function handleWorktreeSelect() {}
	function handleWorktreeDelete() {}

	return (
		<>
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
								onClick={(e) => {
									e.stopPropagation();
									setIsDeleteDialogOpen(true);
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

			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Remove repository?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove "{repository.label}" from your list. The
							repository files on disk will not be affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={handleRepositoryDelete}
							disabled={isDeleting}
						>
							{isDeleting ? (
								<>
									<Spinner className="size-4" />
									Removing...
								</>
							) : (
								"Remove"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
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
