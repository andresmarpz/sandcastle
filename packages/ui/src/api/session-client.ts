import { AtomRpc } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Layer } from "effect";
import { SessionRpc } from "@sandcastle/rpc";

const RPC_URL = "http://localhost:3000/api/rpc";

/**
 * AtomRpc client for SessionRpc operations.
 * Provides query and mutation atoms for session management.
 *
 * Note: Server handlers for sessions are not yet implemented.
 * This client is ready for when the server-side implementation is complete.
 */
export class SessionClient extends AtomRpc.Tag<SessionClient>()(
  "SessionClient",
  {
    group: SessionRpc,
    protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(FetchHttpClient.layer),
    ),
  },
) {}

/** Reactivity key for the session list - used for cache invalidation */
export const SESSION_LIST_KEY = "sessions" as const;
