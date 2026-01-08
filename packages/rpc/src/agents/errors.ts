import { Schema } from "effect";

/**
 * Agent not found by ID.
 */
export class AgentNotFoundRpcError extends Schema.TaggedError<AgentNotFoundRpcError>()(
  "AgentNotFoundRpcError",
  {
    id: Schema.String
  }
) {}

export const AgentRpcError = Schema.Union(AgentNotFoundRpcError);
export type AgentRpcError = typeof AgentRpcError.Type;
