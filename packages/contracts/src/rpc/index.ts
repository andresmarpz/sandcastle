import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import {
	ProjectsCreateRpc,
	ProjectsDeleteRpc,
	ProjectsListRpc,
	ProjectsRenameRpc,
} from "./projects.ts";
import { WorkspacesCreateRpc, WorkspacesDeleteRpc, WorkspacesListRpc } from "./workspaces.ts";

/**
 * Single WS RPC group exposed at `/rpc`. Terminal I/O (attach/write/resize)
 * lands when the PTY layer is added.
 */
export const SandcastleRpc = RpcGroup.make(
	ProjectsListRpc,
	ProjectsCreateRpc,
	ProjectsRenameRpc,
	ProjectsDeleteRpc,
	WorkspacesListRpc,
	WorkspacesCreateRpc,
	WorkspacesDeleteRpc,
);
