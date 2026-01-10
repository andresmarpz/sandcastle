"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";

import type { ChatMessage, ChatStreamEvent } from "@sandcastle/rpc";
import { sessionQuery } from "@sandcastle/ui/api/session-atoms";
import {
  activeSessionsAtom,
  sessionStateFamily,
  chatHistoryQuery,
  startChatStream,
  processChatStreamEvent,
  updateSessionState,
  type StartChatStreamParams,
} from "@sandcastle/ui/api/chat-atoms";
import { Button } from "@sandcastle/ui/components/button";
import { cn } from "@sandcastle/ui/lib/utils";
import { AskUserModal } from "./ask-user-modal";

interface ChatSessionProps {
  sessionId: string;
  worktreeId: string;
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 8l6-6v4h8v4H7v4z" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const content = message.content;

  // Render based on content type
  const renderContent = () => {
    switch (content.type) {
      case "text":
        return (
          <div className="whitespace-pre-wrap break-words">{content.text}</div>
        );
      case "tool_use":
        return (
          <div className="text-xs">
            <div className="font-medium text-muted-foreground mb-1">
              Tool: {content.toolName}
            </div>
            <pre className="bg-muted/50 rounded p-2 overflow-x-auto">
              {JSON.stringify(content.input, null, 2)}
            </pre>
          </div>
        );
      case "tool_result":
        return (
          <div className="text-xs">
            <div className="font-medium text-muted-foreground mb-1">
              Result: {content.toolName}
            </div>
            <pre
              className={cn(
                "rounded p-2 overflow-x-auto",
                content.isError ? "bg-destructive/10" : "bg-muted/50"
              )}
            >
              {typeof content.output === "string"
                ? content.output
                : JSON.stringify(content.output, null, 2)}
            </pre>
          </div>
        );
      case "thinking":
        return (
          <div className="text-muted-foreground italic">{content.text}</div>
        );
      case "error":
        return <div className="text-destructive">{content.error}</div>;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2 mb-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {renderContent()}
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: readonly ChatMessage[];
}

function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Start a conversation...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface ChatInputProps {
  onSend: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || disabled) return;
    onSend(prompt.trim());
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!prompt.trim() || disabled) return;
      onSend(prompt.trim());
      setPrompt("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3">
      <div className="flex gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Cmd+Enter to send)"
          className={cn(
            "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            "placeholder:text-muted-foreground",
            "min-h-[40px] max-h-[120px]"
          )}
          rows={1}
          disabled={disabled || isStreaming}
        />
        {isStreaming ? (
          <Button
            type="button"
            onClick={onStop}
            variant="destructive"
            size="icon"
            className="shrink-0"
          >
            <StopIcon className="size-4" />
            <span className="sr-only">Stop</span>
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!prompt.trim() || disabled}
            size="icon"
            className="shrink-0"
          >
            <SendIcon className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        )}
      </div>
    </form>
  );
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

      // Set streaming state
      setActiveSessions((prev) =>
        updateSessionState(prev, sessionId, {
          isStreaming: true,
          error: null,
        })
      );

      // Start the stream
      // Prefer claudeSessionId from local state (updated by stream events) over DB query (may be stale)
      const streamParams: StartChatStreamParams = {
        sessionId,
        worktreeId,
        prompt,
        claudeSessionId: sessionState?.claudeSessionId ?? session.claudeSessionId,
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
    [session, sessionState, sessionId, worktreeId, setActiveSessions]
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

      <MessageList messages={messages} />
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
