import { RepoSelector } from "@/components/worktree/repo-selector";
import { WorktreeList } from "@/components/worktree/worktree-list";
import { useRepo } from "@/context/repo-context";

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
