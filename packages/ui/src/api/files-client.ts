import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { AtomRpc } from "@effect-atom/atom-react";
import { FilesRpc } from "@sandcastle/rpc/files";
import { Layer } from "effect";
import { RPC_URL } from "./config";

/**
 * AtomRpc client for FilesRpc operations.
 * Provides query atoms for fuzzy file searching within worktrees.
 */
export class FilesClient extends AtomRpc.Tag<FilesClient>()("FilesClient", {
	group: FilesRpc,
	protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
		Layer.provide(RpcSerialization.layerNdjson),
		Layer.provide(FetchHttpClient.layer),
	),
}) {}
