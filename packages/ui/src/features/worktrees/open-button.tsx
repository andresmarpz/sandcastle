"use client";

import type { Worktree } from "@/api/worktree-atoms";
import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { usePlatform } from "@/context/platform-context";
import { FinderIcon, CursorIcon, CopyIcon, ChevronDownIcon } from "./icons";

interface OpenButtonProps {
  worktree: Worktree;
  size?: "default" | "sm" | "lg" | "icon" | "icon-xs";
}

export function OpenButton({ worktree, size = "sm" }: OpenButtonProps) {
  const { openInFileManager, openInEditor, copyToClipboard } = usePlatform();

  // If no platform actions are available, don't render the button
  const hasAnyAction = openInFileManager || openInEditor || copyToClipboard;
  if (!hasAnyAction) {
    return null;
  }

  const handleCopyPath = async () => {
    if (copyToClipboard) {
      await copyToClipboard(worktree.path);
    } else {
      // Fallback to navigator.clipboard
      await navigator.clipboard.writeText(worktree.path);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size={size} className="gap-1">
            Open
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {openInFileManager && (
          <DropdownMenuItem onClick={() => openInFileManager(worktree.path)}>
            <FinderIcon className="size-4" />
            Finder
          </DropdownMenuItem>
        )}
        {openInEditor && (
          <DropdownMenuItem onClick={() => openInEditor(worktree.path)}>
            <CursorIcon className="size-4" />
            Cursor
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleCopyPath}>
          <CopyIcon className="size-4" />
          Copy path
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
