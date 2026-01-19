"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Worktree } from "@sandcastle/schemas";
import { IconChevronDown, IconGitBranch } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { worktreeListByRepositoryAtomFamily } from "@/api/worktree-atoms";
import { Badge } from "@/components/badge";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import {
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/sidebar";
import { Skeleton } from "@/components/skeleton";
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
							className={cn(
								"flex w-full shrink-0 items-center justify-between gap-2 rounded-md p-2 text-sm",
								"text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
								"transition-colors",
							)}
						>
							<span className="flex items-center gap-2">
								<IconGitBranch className="size-4" />
								<span>Worktrees</span>
							</span>
							<span className="flex items-center gap-1.5">
								{worktreeCount > 0 && (
									<Badge variant="secondary" className="px-1.5 py-0 text-xs">
										{worktreeCount}
									</Badge>
								)}
								<IconChevronDown
									className={cn(
										"size-4 transition-transform duration-200",
										!isOpen && "-rotate-90",
									)}
								/>
							</span>
						</CollapsibleTrigger>
						<CollapsiblePanel className="min-h-0 flex-1 overflow-hidden">
							<SidebarMenuSub className="mx-0 ml-3.5 h-full overflow-y-auto">
								{isLoading ? (
									<WorktreeSectionSkeleton />
								) : worktrees.length === 0 ? (
									<WorktreeSectionEmpty />
								) : (
									worktrees.map((worktree) => (
										<WorktreeSubItem key={worktree.id} worktree={worktree} />
									))
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

	const createdAtLabel = useMemo(
		() => formatRelativeTime(worktree.createdAt),
		[worktree.createdAt],
	);

	const isActive = location.pathname.startsWith(`/worktree/${worktree.id}`);

	function handleSelect() {
		navigate(`/worktree/${worktree.id}`);
	}

	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton
				onClick={handleSelect}
				isActive={isActive}
				className="h-auto flex-col items-start gap-0.5 py-1.5"
			>
				<span className="flex items-center gap-1.5 text-sm font-medium">
					<IconGitBranch className="size-3 shrink-0" />
					<span className="truncate">{worktree.branch}</span>
				</span>
				<span className="text-muted-foreground text-xs">
					{worktree.name} · {createdAtLabel}
				</span>
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
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
