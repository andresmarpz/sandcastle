import { Schema } from "effect";

export class WorktreeInfo extends Schema.Class<WorktreeInfo>("WorktreeInfo")({
  path: Schema.String,
  branch: Schema.String,
  commit: Schema.String,
  isMain: Schema.Boolean
}) {}

export class CreateWorktreeOptions extends Schema.Class<CreateWorktreeOptions>(
  "CreateWorktreeOptions"
)({
  repoPath: Schema.String,
  worktreePath: Schema.String,
  branch: Schema.String,
  createBranch: Schema.Boolean,
  fromRef: Schema.optional(Schema.String)
}) {}

export class RemoveWorktreeOptions extends Schema.Class<RemoveWorktreeOptions>(
  "RemoveWorktreeOptions"
)({
  repoPath: Schema.String,
  worktreePath: Schema.String,
  force: Schema.optional(Schema.Boolean)
}) {}
