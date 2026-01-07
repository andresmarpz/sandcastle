import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IconPlus, IconRefresh, IconBrush } from "@tabler/icons-react";
import { useWorktrees, usePruneWorktrees } from "@/api/worktree";
import { WorktreeItem } from "./worktree-item";
import { WorktreeCreateDialog } from "./worktree-create-dialog";
import { WorktreeEmptyState } from "./worktree-empty-state";
import { WorktreeLoading } from "./worktree-loading";
import { WorktreeError } from "./worktree-error";

export function WorktreeList() {
  const {
    data: worktrees,
    isLoading,
    isError,
    error,
    refetch,
  } = useWorktrees();
  const prune = usePruneWorktrees();
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  const handlePrune = async () => {
    try {
      await prune.mutate();
      refetch();
    } catch {
      // Error handling is done in the mutation hook
    }
  };

  if (isLoading) {
    return <WorktreeLoading />;
  }

  if (isError) {
    return <WorktreeError error={error} onRetry={refetch} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-xl font-medium">Worktrees</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refetch}
            title="Refresh"
          >
            <IconRefresh className="size-4" />
            <span className="sr-only">Refresh</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handlePrune}
            disabled={prune.isLoading}
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

      {!worktrees || worktrees.length === 0 ? (
        <WorktreeEmptyState onCreate={() => setCreateDialogOpen(true)} />
      ) : (
        <Card>
          <CardContent className="p-0">
            {worktrees.map((worktree, index) => (
              <React.Fragment key={worktree.path}>
                <WorktreeItem worktree={worktree} onRemoved={refetch} />
                {index < worktrees.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </CardContent>
        </Card>
      )}

      <WorktreeCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={refetch}
      />
    </section>
  );
}
