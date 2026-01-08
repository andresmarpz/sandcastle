import * as React from "react";
import {
  Atom,
  Result,
  useAtom,
  useAtomValue,
  useAtomRefresh,
} from "@effect-atom/atom-react";
import type { WorktreeInfo } from "@sandcastle/rpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IconPlus, IconRefresh, IconBrush } from "@tabler/icons-react";
import { useRepo } from "@/context/repo-context";
import {
  worktreeListQuery,
  pruneWorktreesMutation,
  WORKTREE_LIST_KEY,
} from "@/api/worktree-atoms";
import { WorktreeItem } from "./worktree-item";
import { WorktreeCreateDialog } from "./worktree-create-dialog";
import { WorktreeEmptyState } from "./worktree-empty-state";
import { WorktreeLoading } from "./worktree-loading";
import { WorktreeError } from "./worktree-error";

// Empty result atom for when no repo is selected
const emptyWorktreesAtom = Atom.make(
  Result.success<readonly WorktreeInfo[], never>([]),
);

export function WorktreeList() {
  const { repoPath } = useRepo();
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  // Create the query atom only if we have a repoPath
  const worktreesAtom = React.useMemo(
    () => (repoPath ? worktreeListQuery(repoPath) : emptyWorktreesAtom),
    [repoPath],
  );

  // Read the worktrees result (returns Result type)
  const worktreesResult = useAtomValue(worktreesAtom);

  // Get refresh function for manual refresh
  const refreshWorktrees = useAtomRefresh(worktreesAtom);

  // Mutation for pruning - useAtom returns [result, setter] so we can track loading state
  const [pruneResult, prune] = useAtom(pruneWorktreesMutation, {
    mode: "promiseExit",
  });
  const isPruning = pruneResult.waiting;

  const handlePrune = async () => {
    if (!repoPath) return;
    await prune({
      payload: { repoPath },
      reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:${repoPath}`],
    });
  };

  const handleRefresh = () => {
    refreshWorktrees();
  };

  // Handle no repo selected
  if (!repoPath) {
    return <WorktreeEmptyState onCreate={() => setCreateDialogOpen(true)} />;
  }

  // Use Result.match for declarative rendering
  return Result.match(worktreesResult, {
    onInitial: () => <WorktreeLoading />,
    onFailure: (failure) => (
      <WorktreeError
        error={failure.cause}
        onRetry={handleRefresh}
      />
    ),
    onSuccess: (success) => {
      const worktrees = success.value;
      const isRefreshing = success.waiting;

      return (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-foreground text-xl font-medium">
              Worktrees
              {isRefreshing && (
                <span className="ml-2 text-sm text-muted-foreground">
                  (refreshing...)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRefresh}
                title="Refresh"
              >
                <IconRefresh className="size-4" />
                <span className="sr-only">Refresh</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handlePrune}
                disabled={isPruning}
                title="Prune stale worktrees"
              >
                <IconBrush className="size-4" />
                <span className="sr-only">Prune stale worktrees</span>
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <IconPlus className="size-4" />
                New Worktree
              </Button>
            </div>
          </div>

          {worktrees.length === 0 ? (
            <WorktreeEmptyState onCreate={() => setCreateDialogOpen(true)} />
          ) : (
            <Card>
              <CardContent className="p-0">
                {worktrees.map((worktree, index) => (
                  <React.Fragment key={worktree.path}>
                    <WorktreeItem worktree={worktree} />
                    {index < worktrees.length - 1 && <Separator />}
                  </React.Fragment>
                ))}
              </CardContent>
            </Card>
          )}

          <WorktreeCreateDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
          />
        </section>
      );
    },
  });
}
