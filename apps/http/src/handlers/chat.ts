import { Effect, Layer, Stream } from "effect";

import {
  ChatRpc,
  ChatRpcError,
  ChatSessionNotFoundRpcError,
  ChatStreamEvent,
  DatabaseRpcError,
  NoPendingQuestionRpcError
} from "@sandcastle/rpc";
import {
  StorageService,
  StorageServiceDefault,
  type DatabaseError
} from "@sandcastle/storage";

import {
  ClaudeAgentService,
  ClaudeAgentServiceLive,
  ClaudeAgentError,
  SessionNotActiveError,
  NoPendingQuestionError
} from "../services";

// ─── Error Mapping ───────────────────────────────────────────

const mapClaudeError = (error: ClaudeAgentError): ChatRpcError =>
  new ChatRpcError({ message: error.message, code: error.code });

const mapDatabaseError = (error: DatabaseError): DatabaseRpcError =>
  new DatabaseRpcError({ operation: error.operation, message: error.message });

const mapSessionNotActiveError = (error: SessionNotActiveError): ChatSessionNotFoundRpcError =>
  new ChatSessionNotFoundRpcError({ sessionId: error.sessionId });

const mapNoPendingQuestionError = (error: NoPendingQuestionError): NoPendingQuestionRpcError =>
  new NoPendingQuestionRpcError({ sessionId: error.sessionId });

// ─── Handlers ────────────────────────────────────────────────

export const ChatRpcHandlers = ChatRpc.toLayer(
  Effect.gen(function* () {
    const claude = yield* ClaudeAgentService;
    const storage = yield* StorageService;

    return ChatRpc.of({
      /**
       * Start or continue a streaming chat session.
       * Returns a Stream of ChatStreamEvents.
       */
      "chat.stream": params =>
        Stream.unwrap(
          Effect.gen(function* () {
            // Get the worktree to find the working directory
            const worktree = yield* storage.worktrees.get(params.worktreeId).pipe(
              Effect.mapError(error => {
                if (error._tag === "WorktreeNotFoundError") {
                  return new ChatRpcError({ message: `Worktree not found: ${params.worktreeId}` });
                }
                return mapDatabaseError(error);
              })
            );

            // Update session status to active
            yield* storage.sessions.update(params.sessionId, { status: "active" }).pipe(
              Effect.mapError(error => {
                if (error._tag === "SessionNotFoundError") {
                  return new ChatSessionNotFoundRpcError({ sessionId: params.sessionId });
                }
                return mapDatabaseError(error);
              })
            );

            // Start the chat stream
            const stream = claude.startChat({
              sessionId: params.sessionId,
              worktreePath: worktree.path,
              prompt: params.prompt,
              claudeSessionId: params.claudeSessionId ?? undefined,
              // Callback to persist messages
              onMessage: input => storage.chatMessages.create(input)
            });

            // Transform the stream to handle errors and update session on completion
            return stream.pipe(
              Stream.tap(event => {
                // Update session with claude_session_id and cost info on result
                if (event.type === "init" && event.claudeSessionId) {
                  return storage.sessions.update(params.sessionId, {
                    claudeSessionId: event.claudeSessionId
                  }).pipe(Effect.ignore);
                }
                if (event.type === "result") {
                  return storage.sessions.update(params.sessionId, {
                    status: "paused",
                    claudeSessionId: event.claudeSessionId ?? undefined,
                    totalCostUsd: event.costUsd,
                    inputTokens: event.inputTokens,
                    outputTokens: event.outputTokens
                  }).pipe(Effect.ignore);
                }
                return Effect.void;
              }),
              Stream.mapError(mapClaudeError),
              // Update session to paused when stream ends
              Stream.onDone(() =>
                storage.sessions.update(params.sessionId, { status: "paused" }).pipe(Effect.ignore)
              )
            );
          })
        ),

      /**
       * Respond to an AskUserQuestion event.
       */
      "chat.respond": params =>
        claude.respondToQuestion(params).pipe(
          Effect.mapError(error => {
            if (error._tag === "SessionNotActiveError") {
              return mapSessionNotActiveError(error);
            }
            return mapNoPendingQuestionError(error);
          })
        ),

      /**
       * Interrupt a running chat session.
       */
      "chat.interrupt": params =>
        claude.interrupt(params.sessionId).pipe(
          Effect.tap(() =>
            storage.sessions.update(params.sessionId, { status: "paused" }).pipe(Effect.ignore)
          ),
          Effect.mapError(error => {
            if (error._tag === "SessionNotActiveError") {
              return mapSessionNotActiveError(error);
            }
            return new ChatRpcError({ message: "Failed to interrupt session" });
          })
        ),

      /**
       * Get message history for a session.
       */
      "chat.history": params =>
        storage.chatMessages.listBySession(params.sessionId).pipe(
          Effect.mapError(mapDatabaseError)
        ),

      /**
       * Check if a session is currently streaming.
       */
      "chat.isActive": params =>
        claude.isActive(params.sessionId).pipe(
          Effect.mapError(() => new ChatRpcError({ message: "Failed to check session status" }))
        )
    });
  })
);

// ─── Live Layer ──────────────────────────────────────────────

export const ChatRpcHandlersLive = ChatRpcHandlers.pipe(
  Layer.provide(ClaudeAgentServiceLive),
  Layer.provide(StorageServiceDefault)
);
