import { AtomRpc } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Layer } from "effect";
import { AgentRpc } from "@sandcastle/rpc";
import { RPC_URL } from "./config";

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
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(FetchHttpClient.layer),
    ),
  },
) {}

/** Reactivity key for the agent list - used for cache invalidation */
export const AGENT_LIST_KEY = "agents" as const;
