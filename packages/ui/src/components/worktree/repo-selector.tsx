import { IconFolder, IconX, IconFolderOpen } from "@tabler/icons-react";
import { useRepo } from "@/context/repo-context";
import { Card, CardContent } from "@/components/card";
import { Button } from "@/components/button";

export function RepoSelector() {
  const { repoPath, clearRepoPath, selectRepoWithDialog } = useRepo();

  if (repoPath) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconFolder className="text-primary size-5 shrink-0" />
            <span className="truncate font-mono text-sm">{repoPath}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={selectRepoWithDialog}
              title="Change repository"
            >
              <IconFolderOpen className="size-4" />
              <span className="sr-only">Change repository</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearRepoPath}
              title="Clear repository"
            >
              <IconX className="size-4" />
              <span className="sr-only">Clear repository</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
          <IconFolder className="text-muted-foreground size-6" />
        </div>
        <h3 className="text-foreground font-medium">No repository selected</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Select a git repository to manage its worktrees.
        </p>
        <Button className="mt-4" onClick={selectRepoWithDialog}>
          <IconFolderOpen className="size-4" />
          Select Repository
        </Button>
      </CardContent>
    </Card>
  );
}
