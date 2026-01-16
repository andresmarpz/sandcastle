import { Schema } from "effect";

export const WorktreeStatus = Schema.Literal("active", "stale", "archived");
export type WorktreeStatus = typeof WorktreeStatus.Type;

export class Worktree extends Schema.Class<Worktree>("Worktree")({
	id: Schema.String,
	repositoryId: Schema.String,
	path: Schema.String,
	branch: Schema.String,
	name: Schema.String,
	baseBranch: Schema.String,
	status: WorktreeStatus,
	createdAt: Schema.String,
	lastAccessedAt: Schema.String,
}) {}

export class CreateWorktreeInput extends Schema.Class<CreateWorktreeInput>(
	"CreateWorktreeInput",
)({
	repositoryId: Schema.String,
	path: Schema.String,
	branch: Schema.String,
	name: Schema.String,
	baseBranch: Schema.String,
	status: Schema.optional(WorktreeStatus),
}) {}

export class UpdateWorktreeInput extends Schema.Class<UpdateWorktreeInput>(
	"UpdateWorktreeInput",
)({
	status: Schema.optional(WorktreeStatus),
	lastAccessedAt: Schema.optional(Schema.String),
}) {}
