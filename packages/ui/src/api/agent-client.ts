import { AtomRpc } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Layer } from "effect";
import { AgentRpc } from "@sandcastle/rpc";

const RPC_URL = "http://localhost:3000/api/rpc";

/**
 * AtomRpc client for AgentRpc operations.
 * Provides query and mutation atoms for agent management.
 *
 * Note: Server handlers for agents are not yet implemented.
 * This client is ready for when the server-side implementation is complete.
 */
export class AgentClient extends AtomRpc.Tag<AgentClient>()(
  "AgentClient",
  {
    group: AgentRpc,
    protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(FetchHttpClient.layer),
    ),
  },
) {}

/** Reactivity key for the agent list - used for cache invalidation */
export const AGENT_LIST_KEY = "agents" as const;
