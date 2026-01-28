import { Schema } from "effect";

export class Repository extends Schema.Class<Repository>("Repository")({
	id: Schema.String,
	label: Schema.String,
	directoryPath: Schema.String,
	defaultBranch: Schema.String,
	pinned: Schema.Boolean,
	worktreeInitScript: Schema.optionalWith(Schema.String, { as: "Option" }),
	createdAt: Schema.String,
	updatedAt: Schema.String,
}) {}

export class CreateRepositoryInput extends Schema.Class<CreateRepositoryInput>(
	"CreateRepositoryInput",
)({
	label: Schema.String,
	directoryPath: Schema.String,
	defaultBranch: Schema.optional(Schema.String),
}) {}

export class UpdateRepositoryInput extends Schema.Class<UpdateRepositoryInput>(
	"UpdateRepositoryInput",
)({
	label: Schema.optional(Schema.String),
	defaultBranch: Schema.optional(Schema.String),
	pinned: Schema.optional(Schema.Boolean),
	worktreeInitScript: Schema.optional(Schema.String),
}) {}
