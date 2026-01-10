"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Result,
  useAtom,
  useAtomValue,
  useAtomRefresh,
} from "@effect-atom/atom-react";

import type { Worktree } from "@/api/worktree-atoms";
import {
  sessionListByWorktreeAtomFamily,
  createSessionMutation,
  SESSION_LIST_KEY,
} from "@/api/session-atoms";
import { Button } from "@/components/button";
import { SessionTabs } from "../chat/session-tabs";
import { ChatSession } from "../chat/chat-session";
import { OpenButton } from "./open-button";

interface WorktreeContentProps {
  worktree: Worktree;
  isRefreshing?: boolean;
}

export function WorktreeContent({
  worktree,
  isRefreshing,
}: WorktreeContentProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Use stable atom from family for proper caching and refresh
  const sessionsAtom = useMemo(
    () => sessionListByWorktreeAtomFamily(worktree.id),
    [worktree.id]
  );
  const sessionsResult = useAtomValue(sessionsAtom);
  const refreshSessions = useAtomRefresh(sessionsAtom);
  const [, createSession] = useAtom(createSessionMutation, {
    mode: "promiseExit",
  });

  // Auto-select first session or create one if none exist
  useEffect(() => {
    if (activeSessionId !== null) return;

    if (sessionsResult._tag === "Success") {
      const sessions = sessionsResult.value;
      if (sessions.length > 0 && sessions[0]) {
        setActiveSessionId(sessions[0].id);
      }
    }
  }, [sessionsResult, activeSessionId]);

  // Create initial session if none exist
  const handleCreateInitialSession = useCallback(async () => {
    const result = await createSession({
      payload: {
        worktreeId: worktree.id,
        title: "New Session",
      },
      reactivityKeys: [SESSION_LIST_KEY, `sessions:worktree:${worktree.id}`],
    });
    if (result._tag === "Success") {
      refreshSessions();
      setActiveSessionId(result.value.id);
    }
  }, [worktree.id, createSession, refreshSessions]);

  const handleSessionSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  // Check if we have sessions
  const hasSessions = Result.matchWithWaiting(sessionsResult, {
    onWaiting: () => false,
    onError: () => false,
    onDefect: () => false,
    onSuccess: (success) => success.value.length > 0,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header with worktree info and actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{worktree.name}</span>
          <span className="text-xs text-muted-foreground truncate">
            {worktree.branch}
          </span>
          {isRefreshing && (
            <span className="text-muted-foreground text-xs">Refreshing...</span>
          )}
        </div>
        <OpenButton worktree={worktree} />
      </div>

      {/* Session tabs */}
      <SessionTabs
        worktreeId={worktree.id}
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
      />

      {/* Chat session or empty state */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeSessionId ? (
          <ChatSession sessionId={activeSessionId} worktreeId={worktree.id} />
        ) : hasSessions ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a session
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3 p-4">
            <span>No sessions yet</span>
            <Button onClick={handleCreateInitialSession} size="sm">
              Create Session
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
