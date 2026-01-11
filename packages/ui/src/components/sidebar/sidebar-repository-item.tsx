"use client";

import type { Repository, Worktree } from "@sandcastle/rpc";
import {
	IconChevronRight,
	IconDots,
	IconFolder,
	IconPinned,
	IconPinnedOff,
	IconPlus,
	IconTrash,
} from "@tabler/icons-react";
import * as React from "react";
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
import { Spinner } from "@/components/spinner";
import { cn } from "@/lib/utils";
import { SidebarWorktreeItem } from "./sidebar-worktree-item";

interface SidebarRepositoryItemProps {
	repository: Repository;
	worktrees: Worktree[];
	onPin: () => void;
	onDelete: () => void;
	onCreateWorktree: () => void;
	isCreatingWorktree?: boolean;
	onWorktreeSelect: (worktree: Worktree) => void;
	onWorktreeDelete: (worktree: Worktree) => void | Promise<void>;
	deletingWorktreeId?: string | null;
}

export function SidebarRepositoryItem({
	repository,
	worktrees,
	onPin,
	onDelete,
	onCreateWorktree,
	isCreatingWorktree = false,
	onWorktreeSelect,
	onWorktreeDelete,
	deletingWorktreeId = null,
}: SidebarRepositoryItemProps) {
	const [isOpen, setIsOpen] = React.useState(true);

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<div className="group relative">
				<CollapsibleTrigger
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
								onPin();
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
								onDelete();
							}}
						>
							<IconTrash className="size-4" />
							Remove from list
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<CollapsiblePanel>
				<div className="ml-4 pl-2 space-y-0.5 py-1 border-l">
					<Button
						variant="ghost"
						size="sm"
						className="w-full justify-start gap-2 px-2 text-muted-foreground"
						onClick={onCreateWorktree}
						disabled={isCreatingWorktree}
					>
						<IconPlus className="text-muted-foreground size-3 shrink-0" />
						<span className="truncate text-sm">
							{isCreatingWorktree ? "Creating worktree..." : "New worktree"}
						</span>
						{isCreatingWorktree ? (
							<Spinner className="ml-auto size-3.5" />
						) : null}
					</Button>
					{worktrees.length === 0
						? null
						: worktrees.map((worktree) => (
								<SidebarWorktreeItem
									key={worktree.id}
									worktree={worktree}
									onSelect={onWorktreeSelect}
									onDelete={onWorktreeDelete}
									isDeleting={deletingWorktreeId === worktree.id}
								/>
							))}
				</div>
			</CollapsiblePanel>
		</Collapsible>
	);
}
