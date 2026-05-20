import type { WorkspaceId } from "./ids.ts"
import type { AbsolutePath } from "./paths.ts"
import type { IsoDateTime } from "./time.ts"

export interface Workspace {
  readonly id: WorkspaceId
  readonly label: string
  readonly path: AbsolutePath
  readonly isGit: boolean
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly deletedAt: IsoDateTime | null
}
