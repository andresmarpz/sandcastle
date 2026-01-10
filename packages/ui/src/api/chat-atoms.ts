import { Atom } from "@effect-atom/atom";
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Effect, Layer, Stream } from "effect";

import type {
  ChatMessage,
  ChatStreamEvent,
  AskUserQuestionItem
} from "@sandcastle/rpc";
import { ChatRpc } from "@sandcastle/rpc";

import { ChatClient, CHAT_HISTORY_KEY } from "./chat-client";

// ─── Types ────────────────────────────────────────────────────

/**
 * State for a single active chat session.
 * This state persists even when the chat component is unmounted.
 */
export interface ActiveSessionState {
  /** Messages in the session (persisted + streaming) */
  messages: ChatMessage[];
  /** Whether this session is currently streaming */
  isStreaming: boolean;
  /** Pending AskUserQuestion if any */
  pendingQuestion: {
    toolUseId: string;
    questions: readonly AskUserQuestionItem[];
  } | null;
  /** Error if streaming failed */
  error: string | null;
  /** Claude session ID for resume capability */
  claudeSessionId: string | null;
  /** Cost tracking */
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** Active tool calls (for progress indicators) */
  activeTools: Map<string, { name: string; startTime: number }>;
}

/**
 * Stream subscription handle for cleanup.
 */
export interface StreamSubscription {
  /** Abort the streaming connection */
  abort: () => void;
}

// ─── Global State Atoms ───────────────────────────────────────

/**
 * Global atom tracking all active chat sessions.
 * This state survives component unmount, enabling background streaming.
 *
 * Key: sessionId
 * Value: ActiveSessionState
 */
export const activeSessionsAtom = Atom.make<Map<string, ActiveSessionState>>(new Map());

/**
 * Atom for tracking active stream subscriptions.
 * Used for cleanup when interrupting or unmounting.
 */
export const streamSubscriptionsAtom = Atom.make<Map<string, StreamSubscription>>(new Map());

// ─── Helper Functions ─────────────────────────────────────────

function createEmptySessionState(): ActiveSessionState {
  return {
    messages: [],
    isStreaming: false,
    pendingQuestion: null,
    error: null,
    claudeSessionId: null,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    activeTools: new Map()
  };
}

// ─── Session State Family ─────────────────────────────────────

/**
 * Get state for a specific session (derived from activeSessionsAtom).
 */
export const sessionStateFamily = Atom.family((sessionId: string) =>
  Atom.readable((get) => get(activeSessionsAtom).get(sessionId) ?? null)
);

/**
 * Check if a session is currently streaming (derived).
 */
export const isSessionStreamingFamily = Atom.family((sessionId: string) =>
  Atom.readable((get) => get(activeSessionsAtom).get(sessionId)?.isStreaming ?? false)
);

/**
 * Get messages for a specific session (derived).
 */
export const sessionMessagesFamily = Atom.family((sessionId: string) =>
  Atom.readable((get) => get(activeSessionsAtom).get(sessionId)?.messages ?? [])
);

/**
 * Get pending question for a specific session (derived).
 */
export const pendingQuestionFamily = Atom.family((sessionId: string) =>
  Atom.readable((get) => get(activeSessionsAtom).get(sessionId)?.pendingQuestion ?? null)
);

// ─── Update Functions ─────────────────────────────────────────

/**
 * Update session state atom with type-safe operations.
 * These are pure functions that can be used with Effect or directly.
 */
export function updateSessionState(
  sessions: Map<string, ActiveSessionState>,
  sessionId: string,
  update: Partial<ActiveSessionState> | ((prev: ActiveSessionState) => ActiveSessionState)
): Map<string, ActiveSessionState> {
  const newSessions = new Map(sessions);
  const existing = newSessions.get(sessionId) ?? createEmptySessionState();

  const updated = typeof update === "function"
    ? update(existing)
    : { ...existing, ...update };

  newSessions.set(sessionId, updated);
  return newSessions;
}

/**
 * Add a message to a session.
 */
export function addMessage(
  sessions: Map<string, ActiveSessionState>,
  sessionId: string,
  message: ChatMessage
): Map<string, ActiveSessionState> {
  return updateSessionState(sessions, sessionId, prev => ({
    ...prev,
    messages: [...prev.messages, message]
  }));
}

/**
 * Clear session state (for cleanup).
 */
export function clearSessionState(
  sessions: Map<string, ActiveSessionState>,
  sessionId: string
): Map<string, ActiveSessionState> {
  const newSessions = new Map(sessions);
  newSessions.delete(sessionId);
  return newSessions;
}

// ─── RPC Queries/Mutations ────────────────────────────────────

/**
 * Query atom for fetching chat history for a session.
 */
export const chatHistoryQuery = (sessionId: string) =>
  ChatClient.query(
    "chat.history",
    { sessionId },
    {
      reactivityKeys: [CHAT_HISTORY_KEY, `chat:history:${sessionId}`]
    }
  );

/**
 * Query atom for checking if a session is actively streaming on the server.
 */
export const chatIsActiveQuery = (sessionId: string) =>
  ChatClient.query(
    "chat.isActive",
    { sessionId },
    {
      reactivityKeys: [`chat:active:${sessionId}`],
      timeToLive: 5000 // Short TTL for active status
    }
  );

/**
 * Mutation atom for responding to AskUserQuestion.
 */
export const chatRespondMutation = ChatClient.mutation("chat.respond");

/**
 * Mutation atom for interrupting a running session.
 */
export const chatInterruptMutation = ChatClient.mutation("chat.interrupt");

// ─── Streaming Client ─────────────────────────────────────────

/**
 * Parameters for starting a chat stream.
 */
export interface StartChatStreamParams {
  sessionId: string;
  worktreeId: string;
  prompt: string;
  claudeSessionId?: string | null;
}

/**
 * Start a chat stream using the RPC streaming endpoint.
 * This creates an RPC client and runs the streaming connection.
 *
 * Note: The streaming RPC returns a Stream that emits ChatStreamEvents.
 * This function handles the Effect/Stream complexity and provides a simpler
 * callback-based interface.
 *
 * @param params - The chat parameters
 * @param onEvent - Called for each stream event
 * @param onError - Called if streaming fails
 * @param onComplete - Called when stream ends
 * @returns An abort function to cancel the stream
 */
export function startChatStream(
  params: StartChatStreamParams,
  onEvent: (event: ChatStreamEvent) => void,
  onError?: (error: unknown) => void,
  onComplete?: () => void
): { abort: () => void } {
  console.log("[startChatStream] Called with params:", params);

  const RPC_URL = "http://localhost:3000/api/rpc";

  const makeRpcClientLayer = () =>
    RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(FetchHttpClient.layer)
    );

  const program = Effect.gen(function* () {
    console.log("[startChatStream] Creating RPC client...");
    const client = yield* RpcClient.make(ChatRpc);
    console.log("[startChatStream] RPC client created:", client);

    // Get the stream from the RPC - use type assertion due to complex RPC types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientAny = client as any;
    console.log("[startChatStream] Client methods:", Object.keys(clientAny));
    console.log("[startChatStream] Chat methods:", Object.keys(clientAny.chat || {}));

    const stream = clientAny.chat.stream({
      sessionId: params.sessionId,
      worktreeId: params.worktreeId,
      prompt: params.prompt,
      claudeSessionId: params.claudeSessionId ?? undefined
    }) as Stream.Stream<ChatStreamEvent, unknown>;
    console.log("[startChatStream] Stream created:", stream);

    // Run the stream, processing each event
    console.log("[startChatStream] Running stream...");
    yield* Stream.runForEach(stream, (event: ChatStreamEvent) =>
      Effect.sync(() => {
        console.log("[startChatStream] Event received:", event);
        onEvent(event);
      })
    );
    console.log("[startChatStream] Stream finished");
  }).pipe(
    Effect.scoped,
    Effect.provide(makeRpcClientLayer()),
    Effect.catchAll(error => {
      console.error("[startChatStream] Error caught:", error);
      return Effect.sync(() => {
        if (onError) onError(error);
      });
    }),
    Effect.ensuring(Effect.sync(() => {
      console.log("[startChatStream] Ensuring/cleanup called");
      if (onComplete) onComplete();
    })),
    Effect.interruptible
  );

  console.log("[startChatStream] Forking program...");
  // Run the program - use type assertion to bypass strict type checking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fiber = Effect.runFork(program as any);
  console.log("[startChatStream] Program forked, fiber:", fiber);

  return {
    abort: () => {
      console.log("[startChatStream] Aborting...");
      // Interrupt the fiber to cancel the streaming
      Effect.runFork(fiber.interruptAsFork(fiber.id()));
    }
  };
}

/**
 * Process a chat stream event and update session state.
 * This is called for each event received from the stream.
 */
export function processChatStreamEvent(
  event: ChatStreamEvent,
  updateState: (update: Partial<ActiveSessionState> | ((prev: ActiveSessionState) => ActiveSessionState)) => void
): void {
  switch (event.type) {
    case "init":
      updateState({
        claudeSessionId: event.claudeSessionId ?? null
      });
      break;

    case "message":
      if (event.message) {
        updateState(prev => ({
          ...prev,
          messages: [...prev.messages, event.message!]
        }));
      }
      break;

    case "thinking":
      // Could show a thinking indicator if desired
      break;

    case "tool_start":
      if (event.toolUseId && event.toolName) {
        updateState(prev => {
          const activeTools = new Map(prev.activeTools);
          activeTools.set(event.toolUseId!, {
            name: event.toolName!,
            startTime: Date.now()
          });
          return { ...prev, activeTools };
        });
      }
      break;

    case "tool_end":
      if (event.toolUseId) {
        updateState(prev => {
          const activeTools = new Map(prev.activeTools);
          activeTools.delete(event.toolUseId!);
          return { ...prev, activeTools };
        });
      }
      break;

    case "ask_user":
      if (event.toolUseId && event.questions) {
        updateState({
          pendingQuestion: {
            toolUseId: event.toolUseId,
            questions: event.questions
          }
        });
      }
      break;

    case "progress":
      // Progress updates for long-running tools
      break;

    case "error":
      updateState({
        error: event.errorMessage ?? "Unknown error",
        isStreaming: false
      });
      break;

    case "result":
      updateState(prev => ({
        ...prev,
        isStreaming: false,
        claudeSessionId: event.claudeSessionId ?? prev.claudeSessionId,
        costUsd: event.costUsd ?? prev.costUsd,
        inputTokens: event.inputTokens ?? prev.inputTokens,
        outputTokens: event.outputTokens ?? prev.outputTokens
      }));
      break;
  }
}

// ─── Re-exports ───────────────────────────────────────────────

export { ChatClient, CHAT_HISTORY_KEY };
export type { ChatMessage, ChatStreamEvent, AskUserQuestionItem };
