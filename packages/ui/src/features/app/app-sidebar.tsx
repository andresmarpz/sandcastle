"use client";

import {
  Result,
  useAtom,
  useAtomRefresh,
  useAtomValue,
} from "@effect-atom/atom-react";
import * as Option from "effect/Option";
import * as React from "react";
import { useNavigate, useParams } from "react-router";

import type { Repository, Worktree } from "@sandcastle/rpc";
import {
  deleteRepositoryMutation,
  REPOSITORY_LIST_KEY,
  repositoryListAtom,
  updateRepositoryMutation,
} from "@/api/repository-atoms";
import {
  createWorktreeOptimisticMutation,
  deleteWorktreeMutation,
  optimisticWorktreeListAtom,
  syncWorktreesMutation,
} from "@/api/worktree-atoms";
import { WORKTREE_LIST_KEY } from "@/api/worktree-client";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { Sidebar } from "@/components/sidebar/index";

export function AppSidebar() {
  const navigate = useNavigate();
  const { worktreeId: selectedWorktreeId } = useParams<{
    worktreeId?: string;
  }>();

  const [isNewProjectOpen, setIsNewProjectOpen] = React.useState(false);
  const [creatingWorktreeId, setCreatingWorktreeId] = React.useState<
    string | null
  >(null);
  const [deletingWorktreeId, setDeletingWorktreeId] = React.useState<
    string | null
  >(null);

  // Use stable atoms directly for proper caching
  const repositoriesResult = useAtomValue(repositoryListAtom);
  // Use optimistic atom for automatic optimistic updates with rollback
  const worktreesResult = useAtomValue(optimisticWorktreeListAtom);

  // Refresh hooks for manual cache invalidation after mutations
  const refreshRepositories = useAtomRefresh(repositoryListAtom);
  const refreshWorktrees = useAtomRefresh(optimisticWorktreeListAtom);

  const [, updateRepository] = useAtom(updateRepositoryMutation, {
    mode: "promiseExit",
  });
  const [, deleteRepository] = useAtom(deleteRepositoryMutation, {
    mode: "promiseExit",
  });
  const [, createWorktree] = useAtom(createWorktreeOptimisticMutation, {
    mode: "promiseExit",
  });
  const [, deleteWorktree] = useAtom(deleteWorktreeMutation, {
    mode: "promiseExit",
  });
  const [, syncWorktrees] = useAtom(syncWorktreesMutation, {
    mode: "promiseExit",
  });

  // Sync worktrees on mount to clean up orphaned DB records
  React.useEffect(() => {
    const runSync = async () => {
      try {
        const result = await syncWorktrees({
          payload: {},
          reactivityKeys: [WORKTREE_LIST_KEY],
        });
        refreshWorktrees();
        // If the selected worktree was removed, navigate home
        if (
          selectedWorktreeId &&
          result._tag === "Success" &&
          result.value.removedIds.includes(selectedWorktreeId)
        ) {
          navigate("/");
        }
      } catch {
        // Sync failures are non-critical, just log
        console.warn("Worktree sync failed");
      }
    };
    runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const repositories = React.useMemo(
    () => Option.getOrElse(Result.value(repositoriesResult), () => []),
    [repositoriesResult]
  );

  // Worktrees from the optimistic atom (includes optimistic updates automatically)
  const worktrees = React.useMemo(
    () => Option.getOrElse(Result.value(worktreesResult), () => []),
    [worktreesResult]
  );

  // Group worktrees by repository ID
  const worktreesByRepo = React.useMemo(() => {
    const map = new Map<string, Worktree[]>();

    // Group by repositoryId
    for (const worktree of worktrees) {
      const existing = map.get(worktree.repositoryId) ?? [];
      existing.push(worktree);
      map.set(worktree.repositoryId, existing);
    }

    return map;
  }, [worktrees]);

  const handleOpenProject = () => {
    setIsNewProjectOpen(true);
  };

  const handleCloneFromGit = () => {
    // TODO: Open clone dialog
    console.log("Clone from Git");
  };

  const handleRepositoryPin = async (id: string, pinned: boolean) => {
    await updateRepository({
      payload: { id, input: { pinned } },
      reactivityKeys: [REPOSITORY_LIST_KEY, `repository:${id}`],
    });
    refreshRepositories();
  };

  const handleRepositoryDelete = async (id: string) => {
    await deleteRepository({
      payload: { id },
      reactivityKeys: [REPOSITORY_LIST_KEY, `repository:${id}`],
    });
    refreshRepositories();
    refreshWorktrees(); // Worktrees may be cascade-deleted
  };

  const handleWorktreeSelect = (worktree: Worktree) => {
    // Skip navigation if already viewing this worktree
    if (selectedWorktreeId === worktree.id) return;
    navigate(`/worktrees/${worktree.id}`);
  };

  const handleWorktreeDelete = async (worktree: Worktree) => {
    setDeletingWorktreeId(worktree.id);
    try {
      await deleteWorktree({
        payload: { id: worktree.id },
        reactivityKeys: [
          WORKTREE_LIST_KEY,
          `worktrees:repo:${worktree.repositoryId}`,
        ],
      });
      refreshWorktrees();
      // Navigate home if the deleted worktree was selected
      if (selectedWorktreeId === worktree.id) {
        navigate("/");
      }
    } finally {
      setDeletingWorktreeId(null);
    }
  };

  const handleCreateWorktree = async (repository: Repository) => {
    setCreatingWorktreeId(repository.id);
    try {
      // The optimistic mutation shows a temp worktree immediately
      // and automatically rolls back on failure
      const result = await createWorktree({
        payload: { repositoryId: repository.id },
        reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:repo:${repository.id}`],
      });

      // Navigate to the new worktree after server confirms
      if (result._tag === "Success") {
        navigate(`/worktrees/${result.value.worktree.id}`);
      }
      // No need for manual refresh - reactivityKeys handles it
    } finally {
      setCreatingWorktreeId(null);
    }
  };

  const hasRepositoryCache = Option.isSome(Result.value(repositoriesResult));

  return (
    <>
      <NewProjectDialog
        open={isNewProjectOpen}
        onOpenChange={setIsNewProjectOpen}
      />
      {Result.matchWithWaiting(repositoriesResult, {
        onWaiting: () =>
          hasRepositoryCache ? (
            <Sidebar
              repositories={[...repositories]}
              worktreesByRepo={worktreesByRepo}
              onOpenProject={handleOpenProject}
              onCloneFromGit={handleCloneFromGit}
              onRepositoryPin={handleRepositoryPin}
              onRepositoryDelete={handleRepositoryDelete}
              onCreateWorktree={handleCreateWorktree}
              creatingWorktreeId={creatingWorktreeId}
              onWorktreeSelect={handleWorktreeSelect}
              onWorktreeDelete={handleWorktreeDelete}
              deletingWorktreeId={deletingWorktreeId}
            />
          ) : (
            <SidebarSkeleton />
          ),
        onError: () =>
          hasRepositoryCache ? (
            <Sidebar
              repositories={[...repositories]}
              worktreesByRepo={worktreesByRepo}
              onOpenProject={handleOpenProject}
              onCloneFromGit={handleCloneFromGit}
              onRepositoryPin={handleRepositoryPin}
              onRepositoryDelete={handleRepositoryDelete}
              onCreateWorktree={handleCreateWorktree}
              creatingWorktreeId={creatingWorktreeId}
              onWorktreeSelect={handleWorktreeSelect}
              onWorktreeDelete={handleWorktreeDelete}
              deletingWorktreeId={deletingWorktreeId}
            />
          ) : (
            <SidebarError />
          ),
        onDefect: () =>
          hasRepositoryCache ? (
            <Sidebar
              repositories={[...repositories]}
              worktreesByRepo={worktreesByRepo}
              onOpenProject={handleOpenProject}
              onCloneFromGit={handleCloneFromGit}
              onRepositoryPin={handleRepositoryPin}
              onRepositoryDelete={handleRepositoryDelete}
              onCreateWorktree={handleCreateWorktree}
              creatingWorktreeId={creatingWorktreeId}
              onWorktreeSelect={handleWorktreeSelect}
              onWorktreeDelete={handleWorktreeDelete}
              deletingWorktreeId={deletingWorktreeId}
            />
          ) : (
            <SidebarError />
          ),
        onSuccess: () => (
          <Sidebar
            repositories={[...repositories]}
            worktreesByRepo={worktreesByRepo}
            onOpenProject={handleOpenProject}
            onCloneFromGit={handleCloneFromGit}
            onRepositoryPin={handleRepositoryPin}
            onRepositoryDelete={handleRepositoryDelete}
            onCreateWorktree={handleCreateWorktree}
            creatingWorktreeId={creatingWorktreeId}
            onWorktreeSelect={handleWorktreeSelect}
            onWorktreeDelete={handleWorktreeDelete}
            deletingWorktreeId={deletingWorktreeId}
          />
        ),
      })}
    </>
  );
}

function SidebarSkeleton() {
  return (
    <aside className="bg-background border-border flex h-full w-64 flex-col border-r">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-border flex shrink-0 items-center border-b p-3">
          <div className="bg-muted h-5 w-20 animate-pulse rounded" />
        </div>
        <div className="space-y-2 p-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-8 animate-pulse rounded" />
          ))}
        </div>
      </div>
    </aside>
  );
}

function SidebarError() {
  return (
    <aside className="bg-background border-border flex h-full w-64 flex-col border-r">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-border flex shrink-0 items-center border-b p-3">
          <span className="text-foreground text-sm font-medium">Projects</span>
        </div>
        <div className="text-destructive p-4 text-sm">
          Failed to load projects
        </div>
      </div>
    </aside>
  );
}
