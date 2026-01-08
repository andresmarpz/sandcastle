import type {
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
} from "@sandcastle/rpc";
import { AgentClient, AGENT_LIST_KEY } from "./agent-client";

// Re-export types for consumers
export type { Agent, CreateAgentInput, UpdateAgentInput };

// Re-export the client and key for direct use
export { AgentClient, AGENT_LIST_KEY };

/**
 * Creates a query atom for fetching the list of all agents.
 * Uses reactivity keys for automatic cache invalidation.
 *
 * Note: Server handlers for agents are not yet implemented.
 */
export const agentListQuery = () =>
  AgentClient.query(
    "agent.list",
    {},
    {
      reactivityKeys: [AGENT_LIST_KEY],
    },
  );

/**
 * Creates a query atom for fetching agents belonging to a specific session.
 */
export const agentListBySessionQuery = (sessionId: string) =>
  AgentClient.query(
    "agent.listBySession",
    { sessionId },
    {
      reactivityKeys: [AGENT_LIST_KEY, `agents:session:${sessionId}`],
    },
  );

/**
 * Creates a query atom for fetching a single agent by ID.
 */
export const agentQuery = (id: string) =>
  AgentClient.query(
    "agent.get",
    { id },
    {
      reactivityKeys: [`agent:${id}`],
    },
  );

/**
 * Mutation atom for creating a new agent.
 * Call with payload and reactivityKeys to invalidate the list after creation.
 */
export const createAgentMutation = AgentClient.mutation("agent.create");

/**
 * Mutation atom for updating an agent.
 * Call with payload and reactivityKeys to invalidate the list after update.
 */
export const updateAgentMutation = AgentClient.mutation("agent.update");

/**
 * Mutation atom for deleting an agent.
 * Call with payload and reactivityKeys to invalidate the list after deletion.
 */
export const deleteAgentMutation = AgentClient.mutation("agent.delete");
