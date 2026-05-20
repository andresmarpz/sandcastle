import * as RpcGroup from "effect/unstable/rpc/RpcGroup"

import {
  WorkspacesCreateRpc,
  WorkspacesDeleteRpc,
  WorkspacesGetRpc,
  WorkspacesListRpc,
} from "./workspaces.ts"
import {
  SessionsCreateRpc,
  SessionsDeleteRpc,
  SessionsGetRpc,
  SessionsListRpc,
} from "./sessions.ts"

/**
 * Single WS RPC group exposed at `/rpc`. Terminal I/O (attach/write/resize)
 * lands when the PTY layer is added.
 */
export const SandcastleRpc = RpcGroup.make(
  WorkspacesCreateRpc,
  WorkspacesListRpc,
  WorkspacesGetRpc,
  WorkspacesDeleteRpc,
  SessionsCreateRpc,
  SessionsListRpc,
  SessionsGetRpc,
  SessionsDeleteRpc,
)
