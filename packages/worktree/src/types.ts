export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isMain: boolean
}

export interface CreateWorktreeOptions {
  repoPath: string
  worktreePath: string
  branch: string
  createBranch: boolean
  fromRef?: string
}

export interface RemoveWorktreeOptions {
  repoPath: string
  worktreePath: string
  force?: boolean
}
