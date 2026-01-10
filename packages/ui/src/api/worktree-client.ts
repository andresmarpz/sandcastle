import { AtomRpc } from "@effect-atom/atom-react";
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Layer } from "effect";
import { WorktreeRpc } from "@sandcastle/rpc";
import { RPC_URL } from "./config";

/**
 * AtomRpc client for WorktreeRpc operations.
 * Provides query and mutation atoms for worktree management.
 */
export class WorktreeClient extends AtomRpc.Tag<WorktreeClient>()(
  "WorktreeClient",
  {
    group: WorktreeRpc,
    protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
      Layer.provide(RpcSerialization.layerNdjson),
      Layer.provide(FetchHttpClient.layer),
    ),
  },
) {}

/** Reactivity key for the worktree list - used for cache invalidation */
export const WORKTREE_LIST_KEY = "worktrees" as const;
