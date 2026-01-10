import * as React from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { WorktreePanel } from "@sandcastle/ui/features/worktrees";
import type { Worktree } from "@sandcastle/rpc";

export function RootLayout() {
  const [selectedWorktree, setSelectedWorktree] =
    React.useState<Worktree | null>(null);

  const handleDeselectWorktree = React.useCallback(() => {
    setSelectedWorktree(null);
  }, []);

  return (
    <div className="bg-background flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          selectedWorktree={selectedWorktree}
          onWorktreeSelect={setSelectedWorktree}
          onWorktreeDeselect={handleDeselectWorktree}
        />
        <main className="flex-1 overflow-hidden">
          {selectedWorktree ? (
            <WorktreePanel worktreeId={selectedWorktree.id} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a worktree to start chatting
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
