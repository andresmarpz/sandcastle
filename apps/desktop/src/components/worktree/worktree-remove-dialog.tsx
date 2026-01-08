import * as React from "react";
import { useAtom } from "@effect-atom/atom-react";
import { Cause, Exit } from "effect";
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
import {
  removeWorktreeMutation,
  WORKTREE_LIST_KEY,
} from "@/api/worktree-atoms";
import { useRepo } from "@/context/repo-context";

interface WorktreeRemoveDialogProps {
  worktree: WorktreeInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorktreeRemoveDialog({
  worktree,
  open,
  onOpenChange,
}: WorktreeRemoveDialogProps) {
  const { repoPath } = useRepo();
  const [removeResult, removeWorktree] = useAtom(removeWorktreeMutation, {
    mode: "promiseExit",
  });
  const isLoading = removeResult.waiting;
  const [error, setError] = React.useState<string | null>(null);

  const handleRemove = async (force = false) => {
    if (!repoPath) return;

    const exit = await removeWorktree({
      payload: {
        repoPath,
        worktreePath: worktree.path,
        force,
      },
      // Reactivity keys for automatic cache invalidation
      reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:${repoPath}`],
    });

    if (Exit.isSuccess(exit)) {
      onOpenChange(false);
      setError(null);
    } else {
      // Extract error from Cause
      const err = Cause.failureOption(exit.cause);
      if (err._tag === "Some") {
        const tagged = err.value as {
          _tag: string;
          stderr?: string;
          path?: string;
        };
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

  const handleForceRemove = () => handleRemove(true);

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
            onClick={() => handleRemove(false)}
            disabled={isLoading}
          >
            {isLoading ? "Removing..." : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
