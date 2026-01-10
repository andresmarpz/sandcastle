/**
 * Agent Communication Protocol
 *
 * This defines the contract between the frontend (webview) and backend (http server)
 * for managing Claude Code agent sessions.
 *
 * Architecture:
 * - Uses Effect RPC with NDJSON streaming for real-time updates
 * - Server manages agent lifecycle and Claude Code subprocess
 * - Client receives stream of messages and can send commands
 */

import { Schema } from "effect";

// ============================================================================
// Core Identifiers
// ============================================================================

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export const WorktreeId = Schema.String.pipe(Schema.brand("WorktreeId"));
export type WorktreeId = typeof WorktreeId.Type;

export const ToolUseId = Schema.String.pipe(Schema.brand("ToolUseId"));
export type ToolUseId = typeof ToolUseId.Type;

export const MessageUuid = Schema.String.pipe(Schema.brand("MessageUuid"));
export type MessageUuid = typeof MessageUuid.Type;

// ============================================================================
// Server → Client Messages (Streamed)
// ============================================================================

/**
 * Initial message when session starts - contains metadata
 */
export class AgentInitMessage extends Schema.Class<AgentInitMessage>("AgentInitMessage")({
  type: Schema.Literal("init"),
  sessionId: SessionId,
  worktreeId: WorktreeId,
  model: Schema.String,
  tools: Schema.Array(Schema.String),
  cwd: Schema.String,
  timestamp: Schema.DateTimeUtc,
}) {}

/**
 * Text content from Claude (can be partial for streaming)
 */
export class AgentTextMessage extends Schema.Class<AgentTextMessage>("AgentTextMessage")({
  type: Schema.Literal("text"),
  sessionId: SessionId,
  uuid: MessageUuid,
  text: Schema.String,
  isPartial: Schema.Boolean, // true for streaming tokens, false for complete
}) {}

/**
 * Claude is starting to use a tool
 */
export class AgentToolStartMessage extends Schema.Class<AgentToolStartMessage>("AgentToolStartMessage")({
  type: Schema.Literal("tool_start"),
  sessionId: SessionId,
  uuid: MessageUuid,
  toolUseId: ToolUseId,
  toolName: Schema.String,
  toolInput: Schema.Unknown, // Tool-specific input
}) {}

/**
 * Tool execution completed
 */
export class AgentToolResultMessage extends Schema.Class<AgentToolResultMessage>("AgentToolResultMessage")({
  type: Schema.Literal("tool_result"),
  sessionId: SessionId,
  uuid: MessageUuid,
  toolUseId: ToolUseId,
  toolName: Schema.String,
  success: Schema.Boolean,
  result: Schema.Unknown, // Tool-specific output
}) {}

/**
 * Claude is asking the user a question - BLOCKS until response
 */
export class AgentAskUserMessage extends Schema.Class<AgentAskUserMessage>("AgentAskUserMessage")({
  type: Schema.Literal("ask_user"),
  sessionId: SessionId,
  uuid: MessageUuid,
  toolUseId: ToolUseId,
  questions: Schema.Array(
    Schema.Struct({
      question: Schema.String,
      header: Schema.String,
      options: Schema.Array(
        Schema.Struct({
          label: Schema.String,
          description: Schema.String,
        })
      ),
      multiSelect: Schema.Boolean,
    })
  ),
}) {}

/**
 * Claude needs permission to use a tool - BLOCKS until response
 */
export class AgentPermissionRequestMessage extends Schema.Class<AgentPermissionRequestMessage>("AgentPermissionRequestMessage")({
  type: Schema.Literal("permission_request"),
  sessionId: SessionId,
  uuid: MessageUuid,
  toolUseId: ToolUseId,
  toolName: Schema.String,
  toolInput: Schema.Unknown,
  description: Schema.optionalWith(Schema.String, { as: "Option" }),
}) {}

/**
 * Session completed successfully or with error
 */
export class AgentResultMessage extends Schema.Class<AgentResultMessage>("AgentResultMessage")({
  type: Schema.Literal("result"),
  sessionId: SessionId,
  uuid: MessageUuid,
  subtype: Schema.Union(
    Schema.Literal("success"),
    Schema.Literal("error"),
    Schema.Literal("interrupted"),
    Schema.Literal("max_turns"),
    Schema.Literal("max_budget")
  ),
  result: Schema.optionalWith(Schema.String, { as: "Option" }),
  durationMs: Schema.Number,
  costUsd: Schema.optionalWith(Schema.Number, { as: "Option" }),
  tokenUsage: Schema.optionalWith(
    Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
    }),
    { as: "Option" }
  ),
  numTurns: Schema.Number,
}) {}

/**
 * Error during execution (non-fatal, session may continue)
 */
export class AgentErrorMessage extends Schema.Class<AgentErrorMessage>("AgentErrorMessage")({
  type: Schema.Literal("error"),
  sessionId: SessionId,
  uuid: MessageUuid,
  error: Schema.String,
  recoverable: Schema.Boolean,
}) {}

/**
 * Status update (tool running, thinking, etc.)
 */
export class AgentStatusMessage extends Schema.Class<AgentStatusMessage>("AgentStatusMessage")({
  type: Schema.Literal("status"),
  sessionId: SessionId,
  status: Schema.Union(
    Schema.Literal("thinking"),
    Schema.Literal("tool_running"),
    Schema.Literal("waiting_for_user"),
    Schema.Literal("idle")
  ),
  details: Schema.optionalWith(Schema.String, { as: "Option" }),
}) {}

/**
 * Union of all server → client messages
 */
export const AgentMessage = Schema.Union(
  AgentInitMessage,
  AgentTextMessage,
  AgentToolStartMessage,
  AgentToolResultMessage,
  AgentAskUserMessage,
  AgentPermissionRequestMessage,
  AgentResultMessage,
  AgentErrorMessage,
  AgentStatusMessage
);
export type AgentMessage = typeof AgentMessage.Type;

// ============================================================================
// Client → Server Commands
// ============================================================================

/**
 * Start a new agent session in a worktree
 */
export class StartAgentCommand extends Schema.Class<StartAgentCommand>("StartAgentCommand")({
  command: Schema.Literal("start"),
  worktreeId: WorktreeId,
  prompt: Schema.String,
  options: Schema.optionalWith(
    Schema.Struct({
      model: Schema.optionalWith(Schema.String, { as: "Option" }),
      maxTurns: Schema.optionalWith(Schema.Number, { as: "Option" }),
      allowedTools: Schema.optionalWith(Schema.Array(Schema.String), { as: "Option" }),
      systemPromptAppend: Schema.optionalWith(Schema.String, { as: "Option" }),
    }),
    { as: "Option" }
  ),
}) {}

/**
 * Resume an existing session with a new prompt
 */
export class ResumeAgentCommand extends Schema.Class<ResumeAgentCommand>("ResumeAgentCommand")({
  command: Schema.Literal("resume"),
  sessionId: SessionId,
  prompt: Schema.String,
  fork: Schema.optionalWith(Schema.Boolean, { as: "Option" }), // Fork instead of continue
}) {}

/**
 * Respond to an AskUserQuestion
 */
export class RespondToQuestionCommand extends Schema.Class<RespondToQuestionCommand>("RespondToQuestionCommand")({
  command: Schema.Literal("respond"),
  sessionId: SessionId,
  toolUseId: ToolUseId,
  answers: Schema.Record({ key: Schema.String, value: Schema.String }),
}) {}

/**
 * Approve or deny a tool permission request
 */
export class PermissionResponseCommand extends Schema.Class<PermissionResponseCommand>("PermissionResponseCommand")({
  command: Schema.Literal("permission_response"),
  sessionId: SessionId,
  toolUseId: ToolUseId,
  decision: Schema.Union(
    Schema.Literal("allow"),
    Schema.Literal("deny"),
    Schema.Literal("allow_always") // Remember for session
  ),
  reason: Schema.optionalWith(Schema.String, { as: "Option" }),
  modifiedInput: Schema.optionalWith(Schema.Unknown, { as: "Option" }), // Allow modifying tool input
}) {}

/**
 * Interrupt a running session
 */
export class InterruptCommand extends Schema.Class<InterruptCommand>("InterruptCommand")({
  command: Schema.Literal("interrupt"),
  sessionId: SessionId,
}) {}

/**
 * Change model mid-session (if supported)
 */
export class SetModelCommand extends Schema.Class<SetModelCommand>("SetModelCommand")({
  command: Schema.Literal("set_model"),
  sessionId: SessionId,
  model: Schema.String,
}) {}

/**
 * Union of all client → server commands
 */
export const AgentCommand = Schema.Union(
  StartAgentCommand,
  ResumeAgentCommand,
  RespondToQuestionCommand,
  PermissionResponseCommand,
  InterruptCommand,
  SetModelCommand
);
export type AgentCommand = typeof AgentCommand.Type;

// ============================================================================
// Session State (for querying)
// ============================================================================

export const AgentSessionStatus = Schema.Union(
  Schema.Literal("starting"),
  Schema.Literal("running"),
  Schema.Literal("waiting_for_user"),
  Schema.Literal("idle"),
  Schema.Literal("completed"),
  Schema.Literal("error")
);
export type AgentSessionStatus = typeof AgentSessionStatus.Type;

export class AgentSessionInfo extends Schema.Class<AgentSessionInfo>("AgentSessionInfo")({
  sessionId: SessionId,
  worktreeId: WorktreeId,
  status: AgentSessionStatus,
  model: Schema.String,
  startedAt: Schema.DateTimeUtc,
  lastActivityAt: Schema.DateTimeUtc,
  numTurns: Schema.Number,
  totalCostUsd: Schema.optionalWith(Schema.Number, { as: "Option" }),
  pendingUserInput: Schema.optionalWith(
    Schema.Union(
      Schema.Literal("question"),
      Schema.Literal("permission")
    ),
    { as: "Option" }
  ),
}) {}

// ============================================================================
// RPC Definitions
// ============================================================================

/**
 * These are the RPC endpoints for agent management.
 * Use with @effect/rpc
 */
export const AgentRpcDefinitions = {
  /**
   * Start a new agent session - returns a stream of messages
   * Client sends StartAgentCommand, receives stream of AgentMessage
   */
  runAgent: {
    input: StartAgentCommand,
    output: AgentMessage, // Streamed
  },

  /**
   * Resume an existing session - returns a stream of messages
   */
  resumeAgent: {
    input: ResumeAgentCommand,
    output: AgentMessage, // Streamed
  },

  /**
   * Send a command to a running session (non-streaming)
   * Used for: respond, permission_response, interrupt, set_model
   */
  sendCommand: {
    input: AgentCommand,
    output: Schema.Struct({
      success: Schema.Boolean,
      error: Schema.optionalWith(Schema.String, { as: "Option" }),
    }),
  },

  /**
   * Get current status of a session
   */
  getSession: {
    input: Schema.Struct({ sessionId: SessionId }),
    output: AgentSessionInfo,
  },

  /**
   * List all sessions for a worktree
   */
  listSessions: {
    input: Schema.Struct({ worktreeId: WorktreeId }),
    output: Schema.Array(AgentSessionInfo),
  },
} as const;

// ============================================================================
// Example Usage Documentation
// ============================================================================

/**
 * ## Frontend Usage (React)
 *
 * ```typescript
 * // hooks/use-agent.ts
 * import { useRpcStream, useRpcMutation } from './rpc-hooks';
 *
 * export function useAgent(worktreeId: WorktreeId) {
 *   const [messages, setMessages] = useState<AgentMessage[]>([]);
 *   const [pendingInput, setPendingInput] = useState<AgentAskUserMessage | null>(null);
 *
 *   const runAgent = useRpcStream('runAgent', {
 *     onMessage: (msg) => {
 *       setMessages(prev => [...prev, msg]);
 *
 *       if (msg.type === 'ask_user') {
 *         setPendingInput(msg);
 *       }
 *     }
 *   });
 *
 *   const sendCommand = useRpcMutation('sendCommand');
 *
 *   const start = (prompt: string) => {
 *     setMessages([]);
 *     runAgent.mutate({ command: 'start', worktreeId, prompt });
 *   };
 *
 *   const respond = (answers: Record<string, string>) => {
 *     if (!pendingInput) return;
 *     sendCommand.mutate({
 *       command: 'respond',
 *       sessionId: pendingInput.sessionId,
 *       toolUseId: pendingInput.toolUseId,
 *       answers
 *     });
 *     setPendingInput(null);
 *   };
 *
 *   return { messages, pendingInput, start, respond };
 * }
 * ```
 *
 * ## Backend Usage (Effect)
 *
 * ```typescript
 * // services/agent-manager.ts
 * import { query } from "@anthropic-ai/claude-agent-sdk";
 * import { Deferred, Effect, Stream } from "effect";
 *
 * class AgentManager extends Effect.Service<AgentManager>()("AgentManager", {
 *   effect: Effect.gen(function* () {
 *     const sessions = new Map<SessionId, ActiveSession>();
 *
 *     return {
 *       runAgent: (cmd: StartAgentCommand) => Stream.async<AgentMessage>((emit) => {
 *         // ... see full implementation in agent-manager service
 *       }),
 *
 *       handleCommand: (cmd: AgentCommand) => Effect.gen(function* () {
 *         const session = sessions.get(cmd.sessionId);
 *         if (!session) return { success: false, error: "Session not found" };
 *
 *         switch (cmd.command) {
 *           case "respond":
 *             yield* Deferred.succeed(session.pendingInput, cmd.answers);
 *             break;
 *           case "interrupt":
 *             yield* session.query.interrupt();
 *             break;
 *         }
 *
 *         return { success: true };
 *       }),
 *     };
 *   }),
 * }) {}
 * ```
 */
