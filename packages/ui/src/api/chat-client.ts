import { AtomRpc } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Layer } from "effect";
import { ChatRpc } from "@sandcastle/rpc";
import { RPC_URL } from "./config";

/**
 * AtomRpc client for ChatRpc operations.
 * Provides query and mutation atoms for chat operations.
 *
 * Note: Streaming is handled separately via the streaming utilities
 * in chat-atoms.ts since AtomRpc doesn't directly support streaming RPCs.
 */
export class ChatClient extends AtomRpc.Tag<ChatClient>()(
  "ChatClient",
  {
    group: ChatRpc,
    protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(FetchHttpClient.layer)
    )
  }
) {}

/** Reactivity key for chat history - used for cache invalidation */
export const CHAT_HISTORY_KEY = "chat:history" as const;
