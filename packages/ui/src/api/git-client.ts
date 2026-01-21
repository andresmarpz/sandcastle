import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { AtomRpc } from "@effect-atom/atom-react";
import { GitRpc } from "@sandcastle/rpc";
import { Layer } from "effect";
import { RPC_URL } from "./config";

/**
 * AtomRpc client for GitRpc operations.
 * Provides query atoms for git statistics.
 */
export class GitClient extends AtomRpc.Tag<GitClient>()("GitClient", {
	group: GitRpc,
	protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
		Layer.provide(RpcSerialization.layerNdjson),
		Layer.provide(FetchHttpClient.layer),
	),
}) {}

/** Reactivity key for git stats - used for cache invalidation */
export const GIT_STATS_KEY = "git-stats" as const;
