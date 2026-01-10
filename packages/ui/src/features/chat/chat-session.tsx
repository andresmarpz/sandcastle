"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";

import type { ChatStreamEvent } from "@sandcastle/rpc";
import { sessionQuery } from "@/api/session-atoms";
import {
  activeSessionsAtom,
  sessionStateFamily,
  chatHistoryQuery,
  startChatStream,
  processChatStreamEvent,
  updateSessionState,
  addMessage,
  createUserMessage,
  type StartChatStreamParams,
} from "@/api/chat-atoms";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { AskUserModal } from "./ask-user-modal";

interface ChatSessionProps {
  sessionId: string;
  worktreeId: string;
}

export function ChatSession({ sessionId, worktreeId }: ChatSessionProps) {
  const sessionResult = useAtomValue(sessionQuery(sessionId));
  const historyResult = useAtomValue(chatHistoryQuery(sessionId));
  const sessionState = useAtomValue(sessionStateFamily(sessionId));
  const [, setActiveSessions] = useAtom(activeSessionsAtom);
  const abortRef = useRef<{ abort: () => void } | null>(null);

  // Load history on mount and merge with local state
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!isHistoryLoaded && historyResult._tag === "Success") {
      const history = historyResult.value;
      if (history.length > 0) {
        setActiveSessions((prev) =>
          updateSessionState(prev, sessionId, {
            messages: [...history],
          })
        );
      }
      setIsHistoryLoaded(true);
    }
  }, [historyResult, sessionId, isHistoryLoaded, setActiveSessions]);

  // Get the current session from API
  const session = Result.matchWithWaiting(sessionResult, {
    onWaiting: () => null,
    onError: () => null,
    onDefect: () => null,
    onSuccess: (success) => success.value,
  });

  const messages = sessionState?.messages ?? [];
  const isStreaming = sessionState?.isStreaming ?? false;
  const pendingQuestion = sessionState?.pendingQuestion ?? null;
  const error = sessionState?.error ?? null;
  const costUsd = sessionState?.costUsd ?? 0;
  const inputTokens = sessionState?.inputTokens ?? 0;
  const outputTokens = sessionState?.outputTokens ?? 0;

  const handleCloseQuestion = useCallback(() => {
    setActiveSessions((prev) =>
      updateSessionState(prev, sessionId, { pendingQuestion: null })
    );
  }, [sessionId, setActiveSessions]);

  const handleSend = useCallback(
    (prompt: string) => {
      if (!session) return;

      // Create and add user message immediately for instant feedback
      const userMessage = createUserMessage(sessionId, prompt, messages);

      // Add user message and set streaming state
      setActiveSessions((prev) => {
        let updated = addMessage(prev, sessionId, userMessage);
        updated = updateSessionState(updated, sessionId, {
          isStreaming: true,
          error: null,
        });
        return updated;
      });

      // Start the stream
      // Prefer claudeSessionId from local state (updated by stream events) over DB query (may be stale)
      const streamParams: StartChatStreamParams = {
        sessionId,
        worktreeId,
        prompt,
        claudeSessionId:
          sessionState?.claudeSessionId ?? session.claudeSessionId,
      };

      const subscription = startChatStream(
        streamParams,
        (event: ChatStreamEvent) => {
          // Process each event
          setActiveSessions((prev) => {
            const current = prev.get(sessionId);
            if (!current) return prev;

            let updated = prev;
            processChatStreamEvent(event, (update) => {
              updated = updateSessionState(updated, sessionId, update);
            });
            return updated;
          });
        },
        (error) => {
          // Handle error
          setActiveSessions((prev) =>
            updateSessionState(prev, sessionId, {
              isStreaming: false,
              error: error instanceof Error ? error.message : String(error),
            })
          );
        },
        () => {
          // Stream complete
          setActiveSessions((prev) =>
            updateSessionState(prev, sessionId, { isStreaming: false })
          );
          abortRef.current = null;
        }
      );

      abortRef.current = subscription;
    },
    [session, sessionState, sessionId, worktreeId, messages, setActiveSessions]
  );

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setActiveSessions((prev) =>
      updateSessionState(prev, sessionId, { isStreaming: false })
    );
  }, [sessionId, setActiveSessions]);

  const clearError = useCallback(() => {
    setActiveSessions((prev) =>
      updateSessionState(prev, sessionId, { error: null })
    );
  }, [sessionId, setActiveSessions]);

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading session...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <span className="text-sm text-destructive">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-destructive hover:text-destructive/80 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <MessageList messages={messages} isStreaming={isStreaming} sessionId={sessionId} />

      {/* Session stats bar */}
      {(costUsd > 0 || inputTokens > 0 || outputTokens > 0) && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border text-xs text-muted-foreground">
          {costUsd > 0 && <span>Cost: ${costUsd.toFixed(4)}</span>}
          {inputTokens > 0 && <span>In: {inputTokens.toLocaleString()}</span>}
          {outputTokens > 0 && (
            <span>Out: {outputTokens.toLocaleString()}</span>
          )}
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={pendingQuestion !== null}
      />

      {/* AskUserQuestion Modal */}
      {pendingQuestion && (
        <AskUserModal
          sessionId={sessionId}
          toolUseId={pendingQuestion.toolUseId}
          questions={pendingQuestion.questions}
          onClose={handleCloseQuestion}
        />
      )}
    </div>
  );
}
