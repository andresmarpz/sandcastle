import { RepoSelector } from "@sandcastle/ui/components/worktree/repo-selector.tsx";
import { WorktreeList } from "@sandcastle/ui/components/worktree/worktree-list.tsx";
import { useRepo } from "@sandcastle/ui/context/repo-context.tsx";

export function WorktreesPage() {
  const { repoPath } = useRepo();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">Worktrees</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage git worktrees to work on multiple branches in parallel.
        </p>
      </div>

      <RepoSelector />

      {repoPath && <WorktreeList />}
    </div>
  );
}
