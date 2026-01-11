"use client";

import type { Repository, Worktree } from "@sandcastle/rpc";
import {
	IconBrandGit,
	IconFolderOpen,
	IconLayoutDashboard,
	IconPlus,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { Separator } from "@/components/separator";
import {
	SidebarContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	Sidebar as SidebarPrimitive,
	SidebarRail,
} from "@/components/sidebar";
import { SidebarRepositoryItem } from "./sidebar-repository-item";

interface SidebarProps {
	repositories: Repository[];
	worktreesByRepo: Map<string, Worktree[]>;
	onWorkspacesClick: () => void;
	onOpenProject: () => void;
	onCloneFromGit: () => void;
	onRepositoryPin: (id: string, pinned: boolean) => void;
	onRepositoryDelete: (id: string) => void;
	onCreateWorktree: (repository: Repository) => void;
	creatingWorktreeId?: string | null;
	onWorktreeSelect: (worktree: Worktree) => void;
	onWorktreeDelete: (worktree: Worktree) => void | Promise<void>;
	deletingWorktreeId?: string | null;
}

export function Sidebar({
	repositories,
	worktreesByRepo,
	onWorkspacesClick,
	onOpenProject,
	onCloneFromGit,
	onRepositoryPin,
	onRepositoryDelete,
	onCreateWorktree,
	creatingWorktreeId = null,
	onWorktreeSelect,
	onWorktreeDelete,
	deletingWorktreeId = null,
}: SidebarProps) {
	// Sort: pinned first (by createdAt DESC), then unpinned (by createdAt DESC)
	const sortedRepos = React.useMemo(() => {
		const pinned = repositories
			.filter((r) => r.pinned)
			.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);
		const unpinned = repositories
			.filter((r) => !r.pinned)
			.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);
		return [...pinned, ...unpinned];
	}, [repositories]);

	const pinnedCount = sortedRepos.filter((r) => r.pinned).length;
	const hasBothSections = pinnedCount > 0 && pinnedCount < sortedRepos.length;

	return (
		<SidebarPrimitive collapsible="offExamples">
			{/* Header with Add button */}
			<SidebarHeader
				data-tauri-drag-region
				className="border-border flex-row items-center justify-between border-b"
			>
				<span />
				<DropdownMenu>
					<DropdownMenuTrigger
						render={<Button variant="ghost" size="icon-xs" />}
					>
						<IconPlus className="size-4" />
						<span className="sr-only">Add project</span>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						sideOffset={4}
						className="min-w-[200px]"
					>
						<DropdownMenuItem onClick={onOpenProject}>
							<IconFolderOpen className="size-4" />
							Open project
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onCloneFromGit}>
							<IconBrandGit className="size-4" />
							Clone from Git
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarHeader>

			{/* Repository list */}
			<SidebarContent className="pt-2 px-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton onClick={onWorkspacesClick}>
							<IconLayoutDashboard className="size-4" />
							<span>Workspaces</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				<SidebarMenu>
					{sortedRepos.length === 0 ? (
						<p className="text-muted-foreground px-2 py-4 text-center text-sm">
							No projects yet
						</p>
					) : (
						sortedRepos.map((repo, index) => {
							const worktrees = worktreesByRepo.get(repo.id) ?? [];
							const showSeparator =
								hasBothSections && repo.pinned && index === pinnedCount - 1;

							return (
								<React.Fragment key={repo.id}>
									<SidebarRepositoryItem
										repository={repo}
										worktrees={worktrees}
										onPin={() => onRepositoryPin(repo.id, !repo.pinned)}
										onDelete={() => onRepositoryDelete(repo.id)}
										onCreateWorktree={() => onCreateWorktree(repo)}
										isCreatingWorktree={creatingWorktreeId === repo.id}
										onWorktreeSelect={onWorktreeSelect}
										onWorktreeDelete={onWorktreeDelete}
										deletingWorktreeId={deletingWorktreeId}
									/>
									{showSeparator && <Separator className="my-2" />}
								</React.Fragment>
							);
						})
					)}
				</SidebarMenu>
			</SidebarContent>

			{/* Resize rail */}
			<SidebarRail />
		</SidebarPrimitive>
	);
}
