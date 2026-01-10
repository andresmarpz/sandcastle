import { Routes, Route } from "react-router";
import { ShellLayout } from "./shell-layout";
import { EmptyState } from "@/components/views/empty-state";
import { WorktreeView } from "@/components/views/worktree-view";

export function RootLayout() {
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route index element={<EmptyState />} />
        <Route
          path="worktrees/:worktreeId/sessions/:sessionId"
          element={<WorktreeView />}
        />
        <Route path="worktrees/:worktreeId" element={<WorktreeView />} />
      </Route>
    </Routes>
  );
}
