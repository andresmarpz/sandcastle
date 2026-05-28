import type { ProjectId } from "./ids.ts";
import type { AbsolutePath } from "./paths.ts";
import type { IsoDateTime } from "./time.ts";

export interface Project {
	readonly id: ProjectId;
	readonly name: string;
	readonly rootPath: AbsolutePath;
	readonly isGit: boolean;
	readonly createdAt: IsoDateTime;
	readonly updatedAt: IsoDateTime;
	readonly deletedAt: IsoDateTime | null;
}
