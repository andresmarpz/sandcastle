import { Routes, Route } from "react-router";
import { AppSidebar } from "./app-sidebar";
import { EmptyState } from "@/components/views/empty-state";
import { WorktreeView } from "@/components/views/worktree-view";

export function RootLayout() {
  return (
    <div className="bg-background flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route index element={<EmptyState />} />
            <Route path="worktrees/:worktreeId/*" element={<WorktreeView />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
