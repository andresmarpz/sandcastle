import { Schema } from "effect";

// ─── Status Enums ─────────────────────────────────────────────

export const WorktreeStatus = Schema.Literal("active", "stale", "archived");
export type WorktreeStatus = typeof WorktreeStatus.Type;

export const SessionStatus = Schema.Literal("created", "active", "paused", "completed", "failed");
export type SessionStatus = typeof SessionStatus.Type;

export const AgentStatus = Schema.Literal("starting", "running", "idle", "stopped", "crashed");
export type AgentStatus = typeof AgentStatus.Type;

// ─── Repository ───────────────────────────────────────────────

export class Repository extends Schema.Class<Repository>("Repository")({
  id: Schema.String,
  label: Schema.String,
  directoryPath: Schema.String,
  defaultBranch: Schema.String,
  /** ISO 8601 timestamp */
  createdAt: Schema.String,
  /** ISO 8601 timestamp */
  updatedAt: Schema.String
}) {}

export class CreateRepositoryInput extends Schema.Class<CreateRepositoryInput>(
  "CreateRepositoryInput"
)({
  label: Schema.String,
  directoryPath: Schema.String,
  defaultBranch: Schema.optional(Schema.String)
}) {}

export class UpdateRepositoryInput extends Schema.Class<UpdateRepositoryInput>(
  "UpdateRepositoryInput"
)({
  label: Schema.optional(Schema.String),
  defaultBranch: Schema.optional(Schema.String)
}) {}

// ─── Worktree ─────────────────────────────────────────────────

export class Worktree extends Schema.Class<Worktree>("Worktree")({
  id: Schema.String,
  repositoryId: Schema.String,
  path: Schema.String,
  branch: Schema.String,
  name: Schema.String,
  baseBranch: Schema.String,
  status: WorktreeStatus,
  /** ISO 8601 timestamp */
  createdAt: Schema.String,
  /** ISO 8601 timestamp */
  lastAccessedAt: Schema.String
}) {}

export class CreateWorktreeInput extends Schema.Class<CreateWorktreeInput>("CreateWorktreeInput")({
  repositoryId: Schema.String,
  path: Schema.String,
  branch: Schema.String,
  name: Schema.String,
  baseBranch: Schema.String,
  status: Schema.optional(WorktreeStatus)
}) {}

export class UpdateWorktreeInput extends Schema.Class<UpdateWorktreeInput>("UpdateWorktreeInput")({
  status: Schema.optional(WorktreeStatus),
  /** ISO 8601 timestamp */
  lastAccessedAt: Schema.optional(Schema.String)
}) {}

// ─── Session ──────────────────────────────────────────────────

export class Session extends Schema.Class<Session>("Session")({
  id: Schema.String,
  worktreeId: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  status: SessionStatus,
  /** ISO 8601 timestamp */
  createdAt: Schema.String,
  /** ISO 8601 timestamp */
  lastActivityAt: Schema.String
}) {}

export class CreateSessionInput extends Schema.Class<CreateSessionInput>("CreateSessionInput")({
  worktreeId: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(SessionStatus)
}) {}

export class UpdateSessionInput extends Schema.Class<UpdateSessionInput>("UpdateSessionInput")({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(SessionStatus),
  /** ISO 8601 timestamp */
  lastActivityAt: Schema.optional(Schema.String)
}) {}

// ─── Agent ────────────────────────────────────────────────────

export class Agent extends Schema.Class<Agent>("Agent")({
  id: Schema.String,
  sessionId: Schema.String,
  processId: Schema.NullOr(Schema.Number),
  status: AgentStatus,
  /** ISO 8601 timestamp */
  startedAt: Schema.String,
  /** ISO 8601 timestamp, null if agent is still running */
  stoppedAt: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Number)
}) {}

export class CreateAgentInput extends Schema.Class<CreateAgentInput>("CreateAgentInput")({
  sessionId: Schema.String,
  processId: Schema.optional(Schema.NullOr(Schema.Number)),
  status: Schema.optional(AgentStatus)
}) {}

export class UpdateAgentInput extends Schema.Class<UpdateAgentInput>("UpdateAgentInput")({
  processId: Schema.optional(Schema.NullOr(Schema.Number)),
  status: Schema.optional(AgentStatus),
  /** ISO 8601 timestamp */
  stoppedAt: Schema.optional(Schema.NullOr(Schema.String)),
  exitCode: Schema.optional(Schema.NullOr(Schema.Number))
}) {}
