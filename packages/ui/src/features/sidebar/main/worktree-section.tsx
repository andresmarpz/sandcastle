"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import type { Worktree } from "@sandcastle/schemas";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
	deleteWorktreeMutation,
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
import { Badge } from "@/components/badge";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/context-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/sidebar";
import { Skeleton } from "@/components/skeleton";
import { Spinner } from "@/components/spinner";
import { cn } from "@/lib/utils";

interface WorktreeSectionProps {
	repositoryId: string;
}

export function WorktreeSection({ repositoryId }: WorktreeSectionProps) {
	const [isOpen, setIsOpen] = useState(false);

	const worktreesResult = useAtomValue(
		worktreeListByRepositoryAtomFamily(repositoryId),
	);

	const worktrees = useMemo(
		() => Option.getOrElse(Result.value(worktreesResult), () => []),
		[worktreesResult],
	);

	const isLoading = Result.isWaiting(worktreesResult) && worktrees.length === 0;
	const worktreeCount = worktrees.length;

	return (
		<div className="flex max-h-[35%] flex-col border-t">
			<SidebarMenu className="flex min-h-0 flex-col px-2 py-1">
				<Collapsible
					open={isOpen}
					onOpenChange={setIsOpen}
					className="group/collapsible flex min-h-0 flex-col"
				>
					<SidebarMenuItem className="flex min-h-0 flex-col">
						<CollapsibleTrigger
							render={
								<SidebarMenuButton className="justify-between">
									<span className="flex items-center gap-2">
										<GitBranchIcon className="size-4" />
										<span>Worktrees</span>
									</span>
									<span className="flex items-center gap-1.5">
										{worktreeCount > 0 && (
											<Badge
												variant="secondary"
												className="px-1.5 py-0 text-xs"
											>
												{worktreeCount}
											</Badge>
										)}
										<CaretDownIcon
											className={cn(
												"size-4 transition-transform duration-200",
												!isOpen && "-rotate-90",
											)}
										/>
									</span>
								</SidebarMenuButton>
							}
						/>
						<CollapsiblePanel className="min-h-0 flex-1 overflow-hidden">
							<SidebarMenuSub className="mx-0 ml-3.5 h-full overflow-y-auto">
								{isLoading ? (
									<WorktreeSectionSkeleton />
								) : worktrees.length === 0 ? (
									<WorktreeSectionEmpty />
								) : (
									<AnimatePresence initial={false}>
										{worktrees.map((worktree) => (
											<WorktreeSubItem key={worktree.id} worktree={worktree} />
										))}
									</AnimatePresence>
								)}
							</SidebarMenuSub>
						</CollapsiblePanel>
					</SidebarMenuItem>
				</Collapsible>
			</SidebarMenu>
		</div>
	);
}

interface WorktreeSubItemProps {
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

function WorktreeSubItem({ worktree }: WorktreeSubItemProps) {
	const location = useLocation();
	const navigate = useNavigate();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [, deleteWorktree] = useAtom(deleteWorktreeMutation);

	const createdAtLabel = useMemo(
		() => formatRelativeTime(worktree.createdAt),
		[worktree.createdAt],
	);

	const isActive = location.pathname.startsWith(`/worktree/${worktree.id}`);

	function handleSelect() {
		navigate(`/worktree/${worktree.id}`);
	}

	function handleDelete() {
		setIsDeleteDialogOpen(false);
		setIsDeleting(true);
		deleteWorktree({
			payload: { id: worktree.id },
			reactivityKeys: [
				WORKTREE_LIST_KEY,
				`worktrees:repo:${worktree.repositoryId}`,
			],
		});
	}

	return (
		<>
			<motion.div
				exit={{ opacity: 0, scale: 0.95, height: 0 }}
				transition={{ duration: 0.075, ease: "easeOut" }}
				style={{ overflow: "hidden" }}
			>
				<SidebarMenuSubItem>
					<ContextMenu>
						<ContextMenuTrigger
							render={
								<SidebarMenuSubButton
									onClick={handleSelect}
									isActive={isActive}
									className="h-auto flex-col items-start gap-0.5 py-1.5"
								>
									<span className="flex w-full items-center justify-between gap-1.5">
										<span className="flex items-center gap-1.5 text-sm font-medium min-w-0">
											<GitBranchIcon className="size-3 shrink-0" />
											<span className="truncate">{worktree.branch}</span>
										</span>
										{isDeleting && (
											<Spinner className="size-3 text-muted-foreground shrink-0" />
										)}
									</span>
									<span className="text-muted-foreground text-xs">
										{worktree.name} · {createdAtLabel}
									</span>
								</SidebarMenuSubButton>
							}
						/>
						<ContextMenuContent className="min-w-[160px]">
							<ContextMenuItem
								variant="destructive"
								onClick={() => setIsDeleteDialogOpen(true)}
							>
								<TrashIcon className="size-4" />
								Delete worktree
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				</SidebarMenuSubItem>
			</motion.div>

			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete worktree?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the worktree "{worktree.branch}" from disk and
							Sandcastle. Review any pending work before deleting.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
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

function WorktreeSectionSkeleton() {
	return (
		<>
			<SidebarMenuSubItem>
				<Skeleton className="h-10 w-full" />
			</SidebarMenuSubItem>
			<SidebarMenuSubItem>
				<Skeleton className="h-10 w-full" />
			</SidebarMenuSubItem>
		</>
	);
}

function WorktreeSectionEmpty() {
	return (
		<SidebarMenuSubItem>
			<div className="text-muted-foreground py-2 text-center text-xs">
				No worktrees yet
			</div>
		</SidebarMenuSubItem>
	);
}
