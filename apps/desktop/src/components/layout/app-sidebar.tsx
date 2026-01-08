"use client";

import * as React from "react";
import { Result, useAtomValue, useAtom } from "@effect-atom/atom-react";
import { Sidebar } from "@sandcastle/ui/components/sidebar";
import { NewProjectDialog } from "@sandcastle/ui/components/new-project-dialog";
import {
  repositoryListQuery,
  updateRepositoryMutation,
  deleteRepositoryMutation,
  REPOSITORY_LIST_KEY,
} from "@sandcastle/ui/api/repository-atoms";
import {
  createWorktreeMutation,
  deleteWorktreeMutation,
  worktreeListQuery,
  WORKTREE_LIST_KEY,
} from "@sandcastle/ui/api/worktree-atoms";
import type { Repository, Worktree } from "@sandcastle/rpc";

export function AppSidebar() {
  const [isNewProjectOpen, setIsNewProjectOpen] = React.useState(false);
  const [creatingWorktreeId, setCreatingWorktreeId] = React.useState<
    string | null
  >(null);
  const [deletingWorktreeId, setDeletingWorktreeId] = React.useState<
    string | null
  >(null);
  const repositoriesResult = useAtomValue(repositoryListQuery());
  const worktreesResult = useAtomValue(worktreeListQuery());
  const [, updateRepository] = useAtom(updateRepositoryMutation, {
    mode: "promiseExit",
  });
  const [, deleteRepository] = useAtom(deleteRepositoryMutation, {
    mode: "promiseExit",
  });
  const [, createWorktree] = useAtom(createWorktreeMutation, {
    mode: "promiseExit",
  });
  const [, deleteWorktree] = useAtom(deleteWorktreeMutation, {
    mode: "promiseExit",
  });

  // Group worktrees by repository ID
  const worktreesByRepo = React.useMemo(() => {
    const map = new Map<string, Worktree[]>();

    // Get worktrees from result (default to empty array if not loaded)
    const worktrees = Result.isSuccess(worktreesResult)
      ? worktreesResult.value
      : [];

    // Group by repositoryId
    for (const worktree of worktrees) {
      const existing = map.get(worktree.repositoryId) ?? [];
      existing.push(worktree);
      map.set(worktree.repositoryId, existing);
    }

    return map;
  }, [worktreesResult]);

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
  };

  const handleRepositoryDelete = async (id: string) => {
    await deleteRepository({
      payload: { id },
      reactivityKeys: [REPOSITORY_LIST_KEY, `repository:${id}`],
    });
  };

  const handleWorktreeSelect = (worktree: Worktree) => {
    // TODO: Navigate to worktree view
    console.log("Selected worktree:", worktree);
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
    } finally {
      setDeletingWorktreeId(null);
    }
  };

  const handleCreateWorktree = async (repository: Repository) => {
    setCreatingWorktreeId(repository.id);
    try {
      await createWorktree({
        payload: { repositoryId: repository.id },
        reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:repo:${repository.id}`],
      });
    } finally {
      setCreatingWorktreeId(null);
    }
  };

  return (
    <>
      <NewProjectDialog
        open={isNewProjectOpen}
        onOpenChange={setIsNewProjectOpen}
      />
      {Result.match(repositoriesResult, {
        onInitial: () => <SidebarSkeleton />,
        onFailure: () => <SidebarError />,
        onSuccess: (success) => (
          <Sidebar
            repositories={[...success.value]}
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
            contentClassName="pt-7"
          />
        ),
      })}
    </>
  );
}

function SidebarSkeleton() {
  return (
    <aside className="bg-background border-border flex h-full w-64 flex-col border-r">
      <div className="flex flex-1 flex-col overflow-hidden pt-7">
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
      <div className="flex flex-1 flex-col overflow-hidden pt-7">
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
