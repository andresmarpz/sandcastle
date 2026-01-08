"use client";

import * as React from "react";
import {
  IconChevronRight,
  IconFolder,
  IconGitBranch,
  IconPinned,
  IconPinnedOff,
} from "@tabler/icons-react";
import type { Repository, Worktree } from "@sandcastle/rpc";

import { cn } from "@/lib/utils";
import { Button } from "@/components/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "@/components/collapsible";

interface SidebarRepositoryItemProps {
  repository: Repository;
  worktrees: Worktree[];
  onPin: () => void;
  onWorktreeSelect: (worktree: Worktree) => void;
}

export function SidebarRepositoryItem({
  repository,
  worktrees,
  onPin,
  onWorktreeSelect,
}: SidebarRepositoryItemProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="group flex items-center gap-1">
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start gap-2 px-2"
            >
              <IconChevronRight
                className={cn(
                  "text-muted-foreground size-4 shrink-0 transition-transform duration-150",
                  isOpen && "rotate-90"
                )}
              />
              <IconFolder className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate text-sm">{repository.label}</span>
              {repository.pinned && (
                <IconPinned className="text-primary ml-auto size-3 shrink-0" />
              )}
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onPin();
          }}
          title={repository.pinned ? "Unpin" : "Pin"}
        >
          {repository.pinned ? (
            <IconPinnedOff className="size-3" />
          ) : (
            <IconPinned className="size-3" />
          )}
        </Button>
      </div>

      <CollapsiblePanel>
        <div className="ml-4 space-y-0.5 py-1">
          {worktrees.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1 text-xs">
              No worktrees
            </p>
          ) : (
            worktrees.map((worktree) => (
              <Button
                key={worktree.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 px-2"
                onClick={() => onWorktreeSelect(worktree)}
              >
                <IconGitBranch className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate text-sm">
                  {worktree.name || worktree.branch}
                </span>
              </Button>
            ))
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
