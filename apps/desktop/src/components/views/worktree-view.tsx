"use client";

import { useParams, useNavigate, Routes, Route } from "react-router";
import { WorktreePanel } from "@sandcastle/ui/features/worktrees";

export function WorktreeView() {
  const { worktreeId } = useParams<{ worktreeId: string }>();
  const navigate = useNavigate();

  if (!worktreeId) {
    return null;
  }

  return (
    <Routes>
      <Route
        index
        element={
          <WorktreePanel
            worktreeId={worktreeId}
            onSessionSelect={(id) => navigate(`sessions/${id}`)}
          />
        }
      />
      <Route
        path="sessions/:sessionId"
        element={<WorktreeViewWithSession worktreeId={worktreeId} />}
      />
    </Routes>
  );
}

function WorktreeViewWithSession({ worktreeId }: { worktreeId: string }) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  return (
    <WorktreePanel
      worktreeId={worktreeId}
      sessionId={sessionId}
      onSessionSelect={(id) => navigate(`../${id}`, { relative: "path" })}
    />
  );
}
