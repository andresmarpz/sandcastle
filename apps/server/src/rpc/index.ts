import { Effect } from "effect"

import { SandcastleRpc } from "@sandcastle/contracts"

import { SessionService } from "../services/SessionService.ts"
import { WorkspaceService } from "../services/WorkspaceService.ts"

export const RpcHandlers = SandcastleRpc.toLayer(
  Effect.gen(function* () {
    const workspaces = yield* WorkspaceService
    const sessions = yield* SessionService

    return {
      "workspaces.create": (payload) =>
        workspaces.create({ label: payload.label, path: payload.path }),
      "workspaces.list": () => workspaces.list(),
      "workspaces.get": (payload) => workspaces.get(payload.workspaceId),
      "workspaces.delete": (payload) =>
        workspaces.delete(payload.workspaceId).pipe(Effect.map(() => ({}))),

      "sessions.create": (payload) =>
        sessions.create({
          workspaceId: payload.workspaceId,
          title: payload.title,
          worktreeMode: payload.worktreeMode,
        }),
      "sessions.list": (payload) =>
        sessions.list({ workspaceId: payload.workspaceId }),
      "sessions.get": (payload) => sessions.get(payload.sessionId),
      "sessions.delete": (payload) =>
        sessions.delete(payload.sessionId).pipe(Effect.map(() => ({}))),
    }
  }),
)
