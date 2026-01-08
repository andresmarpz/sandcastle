import { Schema } from "effect";

/**
 * Session not found by ID.
 */
export class SessionNotFoundRpcError extends Schema.TaggedError<SessionNotFoundRpcError>()(
  "SessionNotFoundRpcError",
  {
    id: Schema.String
  }
) {}

export const SessionRpcError = Schema.Union(SessionNotFoundRpcError);
export type SessionRpcError = typeof SessionRpcError.Type;
