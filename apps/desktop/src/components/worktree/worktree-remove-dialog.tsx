import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogMedia,
} from "@/components/ui/alert-dialog";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { WorktreeInfo } from "@sandcastle/rpc";
import { useRemoveWorktree } from "@/api/worktree";
import { useRepo } from "@/context/repo-context";

interface WorktreeRemoveDialogProps {
  worktree: WorktreeInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}

export function WorktreeRemoveDialog({
  worktree,
  open,
  onOpenChange,
  onRemoved,
}: WorktreeRemoveDialogProps) {
  const { repoPath } = useRepo();
  const removeWorktree = useRemoveWorktree();
  const [error, setError] = React.useState<string | null>(null);

  const handleRemove = async () => {
    if (!repoPath) return;

    try {
      await removeWorktree.mutate({
        repoPath,
        worktreePath: worktree.path,
        force: false,
      });
      onRemoved();
      onOpenChange(false);
      setError(null);
    } catch (err) {
      if (err && typeof err === "object" && "_tag" in err) {
        const tagged = err as { _tag: string; stderr?: string; path?: string };
        switch (tagged._tag) {
          case "WorktreeNotFoundRpcError":
            setError("Worktree not found");
            break;
          case "GitCommandRpcError":
            setError(`Git error: ${tagged.stderr}`);
            break;
          default:
            setError("Failed to remove worktree");
        }
      } else {
        setError("Failed to remove worktree");
      }
    }
  };

  const handleForceRemove = async () => {
    if (!repoPath) return;

    try {
      await removeWorktree.mutate({
        repoPath,
        worktreePath: worktree.path,
        force: true,
      });
      onRemoved();
      onOpenChange(false);
      setError(null);
    } catch (_err) {
      setError("Failed to force remove worktree");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <IconAlertTriangle />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove Worktree?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the worktree at{" "}
            <code className="bg-muted rounded px-1 font-mono text-xs">
              {worktree.path}
            </code>
            . The branch <strong>{worktree.branch}</strong> will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="space-y-2">
            <p className="text-destructive text-sm">{error}</p>
            {error.includes("Git error") && (
              <button
                type="button"
                onClick={handleForceRemove}
                className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
              >
                Force remove anyway
              </button>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setError(null)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleRemove}
            disabled={removeWorktree.isLoading}
          >
            {removeWorktree.isLoading ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
