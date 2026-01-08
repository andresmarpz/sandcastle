"use client";

import * as React from "react";
import { IconPlus, IconFolderOpen, IconBrandGit } from "@tabler/icons-react";
import type { Repository, Worktree } from "@sandcastle/rpc";

import { cn } from "@/lib/utils";
import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { Separator } from "@/components/separator";
import { SidebarRepositoryItem } from "./sidebar-repository-item";

interface SidebarProps {
  repositories: Repository[];
  worktreesByRepo: Map<string, Worktree[]>;
  onOpenProject: () => void;
  onCloneFromGit: () => void;
  onRepositoryPin: (id: string, pinned: boolean) => void;
  onWorktreeSelect: (worktree: Worktree) => void;
  className?: string;
  /** Additional padding/spacing for the content area (e.g., to account for a desktop titlebar) */
  contentClassName?: string;
}

export function Sidebar({
  repositories,
  worktreesByRepo,
  onOpenProject,
  onCloneFromGit,
  onRepositoryPin,
  onWorktreeSelect,
  className,
  contentClassName,
}: SidebarProps) {
  // Sort: pinned first (by createdAt DESC), then unpinned (by createdAt DESC)
  const sortedRepos = React.useMemo(() => {
    const pinned = repositories
      .filter((r) => r.pinned)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    const unpinned = repositories
      .filter((r) => !r.pinned)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    return [...pinned, ...unpinned];
  }, [repositories]);

  const pinnedCount = sortedRepos.filter((r) => r.pinned).length;
  const hasBothSections = pinnedCount > 0 && pinnedCount < sortedRepos.length;

  return (
    <aside
      className={cn(
        "bg-background border-border flex h-full w-64 flex-col border-r",
        className
      )}
    >
      <div
        className={cn("flex flex-1 flex-col overflow-hidden", contentClassName)}
      >
        {/* Header with Add button */}
        <div className="border-border flex shrink-0 items-center justify-between border-b p-3">
          <span className="text-foreground text-sm font-medium">Projects</span>
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
        </div>

        {/* Repository list */}
        <nav className="flex-1 overflow-y-auto p-2">
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
                    onWorktreeSelect={onWorktreeSelect}
                  />
                  {showSeparator && <Separator className="my-2" />}
                </React.Fragment>
              );
            })
          )}
        </nav>
      </div>
    </aside>
  );
}
