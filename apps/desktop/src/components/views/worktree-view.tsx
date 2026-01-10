"use client";

import { useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { WorktreePanel } from "@sandcastle/ui/features/worktrees";

export function WorktreeView() {
  const { worktreeId, sessionId } = useParams<{
    worktreeId: string;
    sessionId?: string;
  }>();
  const navigate = useNavigate();

  const handleSessionSelect = useCallback(
    (id: string) => {
      navigate(`/worktrees/${worktreeId}/sessions/${id}`);
    },
    [navigate, worktreeId]
  );

  if (!worktreeId) {
    return null;
  }

  return (
    <WorktreePanel
      worktreeId={worktreeId}
      sessionId={sessionId}
      onSessionSelect={handleSessionSelect}
    />
  );
}
