import { RpcClient, RpcSerialization } from "@effect/rpc";
import { FetchHttpClient } from "@effect/platform";
import { Effect, Layer } from "effect";
import { WorktreeRpc } from "@sandcastle/rpc";

const RPC_URL = "http://localhost:3000/rpc";

// Create the protocol layer for HTTP transport
export const ProtocolLive = RpcClient.layerProtocolHttp({
  url: RPC_URL,
}).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(FetchHttpClient.layer),
);

// Helper to create a client effect
export const makeWorktreeClient = Effect.scoped(
  RpcClient.make(WorktreeRpc),
).pipe(Effect.provide(ProtocolLive));
