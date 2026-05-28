import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
	ProjectsCreateRpc,
	ProjectsDeleteRpc,
	ProjectsListRpc,
	ProjectsRenameRpc,
	ProjectsReorderRpc,
} from "./projects.ts";
import {
	WorkspacesCreateRpc,
	WorkspacesDeleteRpc,
	WorkspacesGetRpc,
	WorkspacesListRpc,
} from "./workspaces.ts";

/**
 * Single WS RPC group exposed at `/rpc`. Terminal I/O (attach/write/resize)
 * lands when the PTY layer is added.
 */
export const SandcastleRpc = RpcGroup.make(
	ProjectsListRpc,
	ProjectsCreateRpc,
	ProjectsRenameRpc,
	ProjectsDeleteRpc,
	ProjectsReorderRpc,
	WorkspacesListRpc,
	WorkspacesGetRpc,
	WorkspacesCreateRpc,
	WorkspacesDeleteRpc,
);
