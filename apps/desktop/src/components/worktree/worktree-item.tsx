import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconGitBranch,
  IconDotsVertical,
  IconFolder,
  IconCopy,
  IconTrash,
} from "@tabler/icons-react";
import type { WorktreeInfo } from "@sandcastle/rpc";
import { WorktreeRemoveDialog } from "./worktree-remove-dialog";

interface WorktreeItemProps {
  worktree: WorktreeInfo;
  onRemoved: () => void;
}

export function WorktreeItem({ worktree, onRemoved }: WorktreeItemProps) {
  const [removeDialogOpen, setRemoveDialogOpen] = React.useState(false);

  const handleCopyPath = () => {
    navigator.clipboard.writeText(worktree.path);
  };

  const shortCommit = worktree.commit.slice(0, 7);

  return (
    <div className="hover:bg-muted/50 group flex items-center gap-4 px-6 py-4 transition-colors">
      <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
        <IconGitBranch className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-foreground truncate font-medium">
            {worktree.branch}
          </h3>
          {worktree.isMain && <Badge variant="secondary">main</Badge>}
        </div>
        <p className="text-muted-foreground truncate font-mono text-sm">
          {worktree.path}
        </p>
        <p className="text-muted-foreground mt-1 flex items-center gap-1 font-mono text-xs">
          {shortCommit}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100"
            />
          }
        >
          <IconDotsVertical className="size-4" />
          <span className="sr-only">Worktree options</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>
            <IconFolder className="size-4" />
            Open in Finder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyPath}>
            <IconCopy className="size-4" />
            Copy Path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setRemoveDialogOpen(true)}
            disabled={worktree.isMain}
          >
            <IconTrash className="size-4" />
            Remove Worktree
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WorktreeRemoveDialog
        worktree={worktree}
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        onRemoved={onRemoved}
      />
    </div>
  );
}
