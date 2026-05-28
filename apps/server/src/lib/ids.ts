import { randomUUID } from "node:crypto";
import { ProjectId, WorkspaceId } from "@sandcastle/contracts";

export const newProjectId = (): ProjectId => ProjectId.make(randomUUID());
export const newWorkspaceId = (): WorkspaceId => WorkspaceId.make(randomUUID());

export const shortId = (id: string): string => id.split("-")[0] ?? id.slice(0, 8);
