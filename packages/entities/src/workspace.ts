import type { ProjectId, WorkspaceId } from "./ids.ts";
import type { AbsolutePath } from "./paths.ts";
import type { IsoDateTime } from "./time.ts";

export type WorkspaceKind = "local" | "worktree";

export interface Workspace {
	readonly id: WorkspaceId;
	readonly projectId: ProjectId;
	readonly name: string;
	readonly kind: WorkspaceKind;
	readonly path: AbsolutePath;
	readonly branch: string | null;
	readonly baseBranch: string | null;
	readonly createdAt: IsoDateTime;
	readonly updatedAt: IsoDateTime;
	readonly deletedAt: IsoDateTime | null;
}
