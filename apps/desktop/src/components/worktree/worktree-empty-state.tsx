import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconGitBranch, IconPlus } from "@tabler/icons-react";

interface WorktreeEmptyStateProps {
  onCreate: () => void;
}

export function WorktreeEmptyState({ onCreate }: WorktreeEmptyStateProps) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
          <IconGitBranch className="text-muted-foreground size-6" />
        </div>
        <h3 className="text-foreground font-medium">No worktrees</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Create a worktree to work on multiple branches simultaneously.
        </p>
        <Button className="mt-4" onClick={onCreate}>
          <IconPlus className="size-4" />
          Create Worktree
        </Button>
      </CardContent>
    </Card>
  );
}
