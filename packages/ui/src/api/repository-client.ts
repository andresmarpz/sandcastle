import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { AtomRpc } from "@effect-atom/atom-react";
import { RepositoryRpc } from "@sandcastle/rpc";
import { Layer } from "effect";
import { RPC_URL } from "./config";

/**
 * AtomRpc client for RepositoryRpc operations.
 * Provides query and mutation atoms for repository management.
 */
export class RepositoryClient extends AtomRpc.Tag<RepositoryClient>()(
	"RepositoryClient",
	{
		group: RepositoryRpc,
		protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
			Layer.provide(RpcSerialization.layerNdjson),
			Layer.provide(FetchHttpClient.layer),
		),
	},
) {}

/** Reactivity key for the repository list - used for cache invalidation */
export const REPOSITORY_LIST_KEY = "repositories" as const;
