import type { ProjectId } from "./ids.ts";
import type { AbsolutePath } from "./paths.ts";
import type { IsoDateTime } from "./time.ts";

export interface Project {
	readonly id: ProjectId;
	readonly name: string;
	readonly rootPath: AbsolutePath;
	readonly isGit: boolean;
	/**
	 * Shell script run once in each new worktree workspace right after it's
	 * created (e.g. `pnpm install`, `just init`). `null` when unset. The local
	 * workspace (the project root itself) is never initialized this way.
	 */
	readonly initScript: string | null;
	readonly createdAt: IsoDateTime;
	readonly updatedAt: IsoDateTime;
	readonly deletedAt: IsoDateTime | null;
}
