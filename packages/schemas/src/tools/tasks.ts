import { Schema } from "effect";

// ============================================================================
// Shared Types
// ============================================================================

export const TaskStatus = Schema.Literal("pending", "in_progress", "completed");
export type TaskStatus = typeof TaskStatus.Type;

export const TaskStatusWithDeleted = Schema.Union(
	TaskStatus,
	Schema.Literal("deleted"),
);
export type TaskStatusWithDeleted = typeof TaskStatusWithDeleted.Type;

export const TaskMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type TaskMetadata = typeof TaskMetadata.Type;

// ============================================================================
// Task Entity
// ============================================================================

export class Task extends Schema.Class<Task>("Task")({
	id: Schema.String,
	subject: Schema.String,
	description: Schema.String,
	status: TaskStatus,
	activeForm: Schema.optional(Schema.String),
	owner: Schema.optional(Schema.String),
	metadata: Schema.optional(TaskMetadata),
	blocks: Schema.optional(Schema.Array(Schema.String)),
	blockedBy: Schema.optional(Schema.Array(Schema.String)),
}) {}

// ============================================================================
// TaskCreate
// ============================================================================

export class TaskCreateInput extends Schema.Class<TaskCreateInput>(
	"TaskCreateInput",
)({
	subject: Schema.String.annotations({
		description: "A brief title for the task",
	}),
	description: Schema.String.annotations({
		description: "A detailed description of what needs to be done",
	}),
	activeForm: Schema.optional(
		Schema.String.annotations({
			description:
				'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
		}),
	),
	metadata: Schema.optional(
		TaskMetadata.annotations({
			description: "Arbitrary metadata to attach to the task",
		}),
	),
}) {}

export class TaskCreateOutput extends Schema.Class<TaskCreateOutput>(
	"TaskCreateOutput",
)({
	taskId: Schema.String,
	message: Schema.String,
}) {}

// ============================================================================
// TaskGet
// ============================================================================

export class TaskGetInput extends Schema.Class<TaskGetInput>("TaskGetInput")({
	taskId: Schema.String.annotations({
		description: "The ID of the task to retrieve",
	}),
}) {}

export class TaskGetOutput extends Schema.Class<TaskGetOutput>("TaskGetOutput")(
	{
		task: Task,
	},
) {}

// ============================================================================
// TaskUpdate
// ============================================================================

export class TaskUpdateInput extends Schema.Class<TaskUpdateInput>(
	"TaskUpdateInput",
)({
	taskId: Schema.String.annotations({
		description: "The ID of the task to update",
	}),
	status: Schema.optional(
		TaskStatusWithDeleted.annotations({
			description: "New status for the task",
		}),
	),
	subject: Schema.optional(
		Schema.String.annotations({
			description: "New subject for the task",
		}),
	),
	description: Schema.optional(
		Schema.String.annotations({
			description: "New description for the task",
		}),
	),
	activeForm: Schema.optional(
		Schema.String.annotations({
			description:
				'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
		}),
	),
	owner: Schema.optional(
		Schema.String.annotations({
			description: "New owner for the task",
		}),
	),
	metadata: Schema.optional(
		TaskMetadata.annotations({
			description:
				"Metadata keys to merge into the task. Set a key to null to delete it.",
		}),
	),
	addBlocks: Schema.optional(
		Schema.Array(Schema.String).annotations({
			description: "Task IDs that this task blocks",
		}),
	),
	addBlockedBy: Schema.optional(
		Schema.Array(Schema.String).annotations({
			description: "Task IDs that block this task",
		}),
	),
}) {}

export class TaskUpdateOutput extends Schema.Class<TaskUpdateOutput>(
	"TaskUpdateOutput",
)({
	message: Schema.String,
}) {}

// ============================================================================
// TaskList
// ============================================================================

export class TaskListInput extends Schema.Class<TaskListInput>("TaskListInput")(
	{},
) {}

export class TaskSummary extends Schema.Class<TaskSummary>("TaskSummary")({
	id: Schema.String,
	subject: Schema.String,
	status: TaskStatus,
	owner: Schema.optional(Schema.String),
	blockedBy: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class TaskListOutput extends Schema.Class<TaskListOutput>(
	"TaskListOutput",
)({
	tasks: Schema.Array(TaskSummary),
}) {}
