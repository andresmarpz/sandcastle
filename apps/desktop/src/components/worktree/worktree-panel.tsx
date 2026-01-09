"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import * as Option from "effect/Option";
import { Command } from "@tauri-apps/plugin-shell";
import {
  worktreeQuery,
  type Worktree,
} from "@sandcastle/ui/api/worktree-atoms";
import { Button } from "@sandcastle/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sandcastle/ui/components/dropdown-menu";

// Placeholder icons - replace with actual SVG icons later
function FinderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="3" width="12" height="10" rx="1" />
    </svg>
  );
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2l10 6-4 1-1 4z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="4" width="8" height="10" rx="1" />
      <rect
        x="2"
        y="2"
        width="8"
        height="10"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface WorktreePanelProps {
  worktreeId: string;
}

async function openInFinder(path: string) {
  // Open -R reveals the item in Finder
  const command = Command.create("open", ["-R", path]);
  await command.execute();
}

async function openInCursor(path: string) {
  // Open the path with Cursor using macOS open command
  const command = Command.create("open", ["-a", "Cursor", path]);
  await command.execute();
}

async function copyPath(path: string) {
  await navigator.clipboard.writeText(path);
}

interface OpenButtonProps {
  worktree: Worktree;
}

function OpenButton({ worktree }: OpenButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1">
            Open
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem onClick={() => openInFinder(worktree.path)}>
          <FinderIcon className="size-4" />
          Finder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openInCursor(worktree.path)}>
          <CursorIcon className="size-4" />
          Cursor
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copyPath(worktree.path)}>
          <CopyIcon className="size-4" />
          Copy path
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface WorktreeContentProps {
  worktree: Worktree;
  isRefreshing?: boolean;
}

function WorktreeContent({ worktree, isRefreshing }: WorktreeContentProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          {isRefreshing && (
            <div className="text-muted-foreground text-xs">
              Refreshing worktree details...
            </div>
          )}
        </div>
        <OpenButton worktree={worktree} />
      </div>
      <pre className="bg-muted/30 text-foreground overflow-auto rounded-lg p-4 text-xs">
        {JSON.stringify(worktree, null, 2)}
      </pre>
    </div>
  );
}

export function WorktreePanel({ worktreeId }: WorktreePanelProps) {
  const worktreeResult = useAtomValue(worktreeQuery(worktreeId));

  return Result.matchWithWaiting(worktreeResult, {
    onWaiting: (result) => {
      const cached = Option.getOrNull(Result.value(result));
      if (!cached) {
        return (
          <div className="text-muted-foreground text-sm">
            Loading worktree...
          </div>
        );
      }
      return <WorktreeContent worktree={cached} isRefreshing />;
    },
    onError: () => (
      <div className="text-destructive text-sm">
        Failed to load worktree details.
      </div>
    ),
    onDefect: () => (
      <div className="text-destructive text-sm">
        Failed to load worktree details.
      </div>
    ),
    onSuccess: (success) => <WorktreeContent worktree={success.value} />,
  });
}
