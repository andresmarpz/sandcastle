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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  createWorktreeMutation,
  WORKTREE_LIST_KEY,
} from "@/api/worktree-atoms";
import { useRepo } from "@/context/repo-context";

interface WorktreeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorktreeCreateDialog({
  open,
  onOpenChange,
}: WorktreeCreateDialogProps) {
  const { repoPath } = useRepo();
  const [createResult, createWorktree] = useAtom(createWorktreeMutation, {
    mode: "promiseExit",
  });
  const isLoading = createResult.waiting;

  const [branch, setBranch] = React.useState("");
  const [worktreePath, setWorktreePath] = React.useState("");
  const [createBranch, setCreateBranch] = React.useState(true);
  const [fromRef, setFromRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!repoPath) {
      setError("No repository selected");
      return;
    }

    if (!branch.trim()) {
      setError("Branch name is required");
      return;
    }

    if (!worktreePath.trim()) {
      setError("Worktree path is required");
      return;
    }

    const exit = await createWorktree({
      payload: {
        repoPath,
        worktreePath: worktreePath.trim(),
        branch: branch.trim(),
        createBranch,
        fromRef: fromRef.trim() || undefined,
      },
      // Reactivity keys for automatic cache invalidation
      reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:${repoPath}`],
    });

    if (Exit.isSuccess(exit)) {
      onOpenChange(false);
      resetForm();
    } else {
      // Extract error from Cause
      const err = Cause.failureOption(exit.cause);
      if (err._tag === "Some") {
        const tagged = err.value as {
          _tag: string;
          path?: string;
          branch?: string;
          stderr?: string;
        };
        switch (tagged._tag) {
          case "WorktreeExistsRpcError":
            setError(`Worktree already exists at ${tagged.path}`);
            break;
          case "BranchExistsRpcError":
            setError(`Branch "${tagged.branch}" already exists`);
            break;
          case "GitCommandRpcError":
            setError(`Git error: ${tagged.stderr}`);
            break;
          default:
            setError("Failed to create worktree");
        }
      } else {
        setError("Failed to create worktree");
      }
    }
  };

  const resetForm = () => {
    setBranch("");
    setWorktreePath("");
    setCreateBranch(true);
    setFromRef("");
    setError(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Create New Worktree</AlertDialogTitle>
            <AlertDialogDescription>
              Create a new worktree to work on a separate branch in parallel.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="branch">Branch Name</FieldLabel>
              <Input
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="feature/my-feature"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="path">Worktree Path</FieldLabel>
              <Input
                id="path"
                value={worktreePath}
                onChange={(e) => setWorktreePath(e.target.value)}
                placeholder="/path/to/worktree"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="mode">Mode</FieldLabel>
              <Select
                value={createBranch ? "new" : "existing"}
                onValueChange={(value) => setCreateBranch(value === "new")}
              >
                <SelectTrigger id="mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create new branch</SelectItem>
                  <SelectItem value="existing">Use existing branch</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {createBranch && (
              <Field>
                <FieldLabel htmlFor="fromRef">
                  Base Reference (optional)
                </FieldLabel>
                <Input
                  id="fromRef"
                  value={fromRef}
                  onChange={(e) => setFromRef(e.target.value)}
                  placeholder="main, HEAD, commit SHA..."
                />
              </Field>
            )}

            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
