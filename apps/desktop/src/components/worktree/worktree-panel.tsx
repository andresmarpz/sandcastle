"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Result,
  useAtom,
  useAtomValue,
  useAtomRefresh,
} from "@effect-atom/atom-react";
import * as Option from "effect/Option";
import { Command } from "@tauri-apps/plugin-shell";
import {
  worktreeAtomFamily,
  type Worktree,
} from "@sandcastle/ui/api/worktree-atoms";
import {
  sessionListByWorktreeAtomFamily,
  createSessionMutation,
  SESSION_LIST_KEY,
} from "@sandcastle/ui/api/session-atoms";
import { Button } from "@sandcastle/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sandcastle/ui/components/dropdown-menu";
import { SessionTabs } from "../chat/session-tabs";
import { ChatSession } from "../chat/chat-session";

// Placeholder icons - replace with actual SVG icons later
function FinderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="3" width="12" height="10" rx="1" />
    </svg>
  );
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2l10 6-4 1-1 4z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="4" width="8" height="10" rx="1" />
      <rect
        x="2"
        y="2"
        width="8"
        height="10"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface WorktreePanelProps {
  worktreeId: string;
}

async function openInFinder(path: string) {
  // Open -R reveals the item in Finder
  const command = Command.create("open", ["-R", path]);
  await command.execute();
}

async function openInCursor(path: string) {
  // Open the path with Cursor using macOS open command
  const command = Command.create("open", ["-a", "Cursor", path]);
  await command.execute();
}

async function copyPath(path: string) {
  await navigator.clipboard.writeText(path);
}

interface OpenButtonProps {
  worktree: Worktree;
}

function OpenButton({ worktree }: OpenButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1">
            Open
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem onClick={() => openInFinder(worktree.path)}>
          <FinderIcon className="size-4" />
          Finder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openInCursor(worktree.path)}>
          <CursorIcon className="size-4" />
          Cursor
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copyPath(worktree.path)}>
          <CopyIcon className="size-4" />
          Copy path
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface WorktreeContentProps {
  worktree: Worktree;
  isRefreshing?: boolean;
}

function WorktreeContent({ worktree, isRefreshing }: WorktreeContentProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Use stable atom from family for proper caching and refresh
  const sessionsAtom = useMemo(
    () => sessionListByWorktreeAtomFamily(worktree.id),
    [worktree.id],
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

export function WorktreePanel({ worktreeId }: WorktreePanelProps) {
  // Use stable atom from family for proper caching
  const worktreeAtom = useMemo(
    () => worktreeAtomFamily(worktreeId),
    [worktreeId],
  );
  const worktreeResult = useAtomValue(worktreeAtom);

  return (
    <div className="h-full">
      {Result.matchWithWaiting(worktreeResult, {
        onWaiting: (result) => {
          const cached = Option.getOrNull(Result.value(result));
          if (!cached) {
            return (
              <div className="text-muted-foreground text-sm p-4">
                Loading...
              </div>
            );
          }
          return <WorktreeContent worktree={cached} isRefreshing />;
        },
        onError: () => (
          <div className="text-destructive text-sm p-4">
            Failed to load worktree details.
          </div>
        ),
        onDefect: () => (
          <div className="text-destructive text-sm p-4">
            Failed to load worktree details.
          </div>
        ),
        onSuccess: (success) => <WorktreeContent worktree={success.value} />,
      })}
    </div>
  );
}
