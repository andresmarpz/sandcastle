import * as React from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { WorktreePanel } from "@/components/worktree/worktree-panel";
import type { Worktree } from "@sandcastle/rpc";

export function RootLayout() {
  const [selectedWorktree, setSelectedWorktree] =
    React.useState<Worktree | null>(null);

  return (
    <div className="bg-background flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar onWorktreeSelect={setSelectedWorktree} />
        <main className="flex-1 overflow-y-auto p-6 pt-13">
          {selectedWorktree ? (
            <WorktreePanel worktreeId={selectedWorktree.id} />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              <p className="text-sm">
                Select a project or worktree to get started
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
