import { SandcastleRpc } from "@sandcastle/contracts";
import { Effect } from "effect";

import { ProjectService } from "../services/ProjectService.ts";
import { WorkspaceService } from "../services/WorkspaceService.ts";

export const RpcHandlers = SandcastleRpc.toLayer(
	Effect.gen(function* () {
		const projects = yield* ProjectService;
		const workspaces = yield* WorkspaceService;

		return {
			"projects.list": () => projects.list(),
			"projects.create": (payload) =>
				projects.create({ name: payload.name, rootPath: payload.rootPath }),
			"projects.rename": (payload) => projects.rename(payload.projectId, payload.name),
			"projects.delete": (payload) =>
				projects.delete(payload.projectId).pipe(Effect.map(() => ({}))),

			"workspaces.list": (payload) => workspaces.list(payload.projectId),
			"workspaces.create": (payload) =>
				workspaces.create({
					projectId: payload.projectId,
					name: payload.name,
					config: payload.config,
				}),
			"workspaces.delete": (payload) =>
				workspaces.delete(payload.workspaceId).pipe(Effect.map(() => ({}))),
		};
	}),
);
