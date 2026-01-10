import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

import { AskUserQuestionItem, ChatMessage } from "@sandcastle/storage/entities";

import { DatabaseRpcError } from "../common/errors";

// ─── Errors ──────────────────────────────────────────────────

/**
 * Generic chat operation error
 */
export class ChatRpcError extends Schema.TaggedError<ChatRpcError>()("ChatRpcError", {
  message: Schema.String,
  code: Schema.optional(Schema.String)
}) {}

/**
 * Session not found error
 */
export class ChatSessionNotFoundRpcError extends Schema.TaggedError<ChatSessionNotFoundRpcError>()(
  "ChatSessionNotFoundRpcError",
  {
    sessionId: Schema.String
  }
) {}

/**
 * No pending question to respond to
 */
export class NoPendingQuestionRpcError extends Schema.TaggedError<NoPendingQuestionRpcError>()(
  "NoPendingQuestionRpcError",
  {
    sessionId: Schema.String
  }
) {}

// ─── Stream Event Types ──────────────────────────────────────

/**
 * Event types emitted during chat streaming
 */
export const ChatStreamEventType = Schema.Literal(
  "init", // Session initialized with claude_session_id
  "message", // New message (user, assistant, tool_use, tool_result)
  "thinking", // Claude is thinking
  "tool_start", // Tool execution started
  "tool_end", // Tool execution completed
  "ask_user", // AskUserQuestion - need user input
  "progress", // Progress indicator for long operations
  "error", // Error occurred
  "result", // Final result with cost/token info
  "text_delta" // Streaming text chunk
);
export type ChatStreamEventType = typeof ChatStreamEventType.Type;

/**
 * Streaming event sent from server to client during chat
 */
export class ChatStreamEvent extends Schema.Class<ChatStreamEvent>("ChatStreamEvent")({
  type: ChatStreamEventType,

  // For init
  claudeSessionId: Schema.optional(Schema.String),

  // For message
  message: Schema.optional(ChatMessage),

  // For thinking
  thinkingText: Schema.optional(Schema.String),

  // For tool_start and tool_end
  toolUseId: Schema.optional(Schema.String),
  toolName: Schema.optional(Schema.String),

  // For tool_end
  toolOutput: Schema.optional(Schema.Unknown),
  toolIsError: Schema.optional(Schema.Boolean),

  // For ask_user
  questions: Schema.optional(Schema.Array(AskUserQuestionItem)),

  // For progress
  progressText: Schema.optional(Schema.String),
  elapsedSeconds: Schema.optional(Schema.Number),

  // For error
  errorMessage: Schema.optional(Schema.String),
  errorCode: Schema.optional(Schema.String),

  // For result
  result: Schema.optional(Schema.String),
  costUsd: Schema.optional(Schema.Number),
  inputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number),

  // For text_delta (streaming text chunks)
  textDelta: Schema.optional(Schema.String),
  contentBlockIndex: Schema.optional(Schema.Number),
  uuid: Schema.optional(Schema.String)
}) {}

// ─── Input Types ─────────────────────────────────────────────

/**
 * Input for starting or continuing a chat stream
 */
export class ChatStreamInput extends Schema.Class<ChatStreamInput>("ChatStreamInput")({
  /** Session ID from storage */
  sessionId: Schema.String,
  /** Worktree ID - used to get the working directory */
  worktreeId: Schema.String,
  /** The prompt to send */
  prompt: Schema.String,
  /** Optional: Claude session ID for resume */
  claudeSessionId: Schema.optional(Schema.NullOr(Schema.String))
}) {}

/**
 * Input for responding to AskUserQuestion
 */
export class ChatRespondInput extends Schema.Class<ChatRespondInput>("ChatRespondInput")({
  /** Session ID */
  sessionId: Schema.String,
  /** Tool use ID from the ask_user event */
  toolUseId: Schema.String,
  /** Answers keyed by question header */
  answers: Schema.Record({ key: Schema.String, value: Schema.String })
}) {}

// ─── RPC Group ───────────────────────────────────────────────

/**
 * Chat RPC group - full-featured chat with streaming
 */
export class ChatRpc extends RpcGroup.make(
  /**
   * Start or continue a streaming chat session.
   * Returns a stream of ChatStreamEvents.
   */
  Rpc.make("chat.stream", {
    payload: ChatStreamInput,
    success: ChatStreamEvent,
    error: Schema.Union(ChatRpcError, ChatSessionNotFoundRpcError, DatabaseRpcError),
    stream: true // Enable streaming
  }),

  /**
   * Respond to an AskUserQuestion event.
   * Resumes the paused chat stream.
   */
  Rpc.make("chat.respond", {
    payload: ChatRespondInput,
    success: Schema.Void,
    error: Schema.Union(ChatRpcError, NoPendingQuestionRpcError, ChatSessionNotFoundRpcError)
  }),

  /**
   * Interrupt a running chat session.
   * Aborts the current Claude query.
   */
  Rpc.make("chat.interrupt", {
    payload: { sessionId: Schema.String },
    success: Schema.Void,
    error: Schema.Union(ChatRpcError, ChatSessionNotFoundRpcError)
  }),

  /**
   * Get message history for a session.
   * Used for restoring chat state on mount.
   */
  Rpc.make("chat.history", {
    payload: { sessionId: Schema.String },
    success: Schema.Array(ChatMessage),
    error: Schema.Union(ChatRpcError, DatabaseRpcError)
  }),

  /**
   * Check if a session is currently streaming.
   */
  Rpc.make("chat.isActive", {
    payload: { sessionId: Schema.String },
    success: Schema.Boolean,
    error: ChatRpcError
  })
) {}
