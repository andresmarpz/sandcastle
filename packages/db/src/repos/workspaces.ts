import type {
	AbsolutePath,
	IsoDateTime,
	ProjectId,
	Workspace,
	WorkspaceId,
	WorkspaceKind,
} from "@sandcastle/entities";
import { Context, Effect, Layer } from "effect";
import { Sqlite } from "../client.ts";
import { type SqliteError, WorkspaceNotFound, WorkspacePathConflict } from "../errors.ts";

interface WorkspaceRow {
	readonly id: string;
	readonly project_id: string;
	readonly name: string;
	readonly kind: string;
	readonly path: string;
	readonly branch: string | null;
	readonly base_branch: string | null;
	readonly created_at: string;
	readonly updated_at: string;
	readonly deleted_at: string | null;
}

const SELECT_COLUMNS =
	"id, project_id, name, kind, path, branch, base_branch, created_at, updated_at, deleted_at";

const decodeRow = (row: WorkspaceRow): Workspace => ({
	id: row.id as WorkspaceId,
	projectId: row.project_id as ProjectId,
	name: row.name,
	kind: row.kind as WorkspaceKind,
	path: row.path as AbsolutePath,
	branch: row.branch,
	baseBranch: row.base_branch,
	createdAt: row.created_at as IsoDateTime,
	updatedAt: row.updated_at as IsoDateTime,
	deletedAt: (row.deleted_at ?? null) as IsoDateTime | null,
});

export interface ListWorkspacesFilter {
	readonly projectId?: ProjectId;
}

export interface CreateWorkspaceInput {
	readonly id: WorkspaceId;
	readonly projectId: ProjectId;
	readonly name: string;
	readonly kind: WorkspaceKind;
	readonly path: AbsolutePath;
	readonly branch: string | null;
	readonly baseBranch: string | null;
}

export class Workspaces extends Context.Service<
	Workspaces,
	{
		readonly list: (
			filter?: ListWorkspacesFilter,
		) => Effect.Effect<ReadonlyArray<Workspace>, SqliteError>;
		readonly getById: (id: WorkspaceId) => Effect.Effect<Workspace | null, SqliteError>;
		readonly getActiveByPath: (path: AbsolutePath) => Effect.Effect<Workspace | null, SqliteError>;
		readonly create: (
			input: CreateWorkspaceInput,
		) => Effect.Effect<Workspace, SqliteError | WorkspacePathConflict>;
		readonly softDelete: (id: WorkspaceId) => Effect.Effect<void, SqliteError | WorkspaceNotFound>;
	}
>()("@sandcastle/db/Workspaces") {}

export const layer: Layer.Layer<Workspaces, never, Sqlite> = Layer.effect(Workspaces)(
	Effect.gen(function* () {
		const sqlite = yield* Sqlite;

		const list = (filter?: ListWorkspacesFilter) => {
			if (filter?.projectId !== undefined) {
				return sqlite
					.query<WorkspaceRow>(
						`SELECT ${SELECT_COLUMNS} FROM workspaces WHERE deleted_at IS NULL AND project_id = ? ORDER BY created_at ASC`,
						[filter.projectId as string],
					)
					.pipe(Effect.map((rows) => rows.map(decodeRow)));
			}
			return sqlite
				.query<WorkspaceRow>(
					`SELECT ${SELECT_COLUMNS} FROM workspaces WHERE deleted_at IS NULL ORDER BY created_at ASC`,
				)
				.pipe(Effect.map((rows) => rows.map(decodeRow)));
		};

		const getById = (id: WorkspaceId) =>
			sqlite
				.queryOne<WorkspaceRow>(`SELECT ${SELECT_COLUMNS} FROM workspaces WHERE id = ?`, [
					id as string,
				])
				.pipe(Effect.map((row) => (row === null ? null : decodeRow(row))));

		const getActiveByPath = (path: AbsolutePath) =>
			sqlite
				.queryOne<WorkspaceRow>(
					`SELECT ${SELECT_COLUMNS} FROM workspaces WHERE path = ? AND deleted_at IS NULL`,
					[path as string],
				)
				.pipe(Effect.map((row) => (row === null ? null : decodeRow(row))));

		const create = (input: CreateWorkspaceInput) =>
			Effect.gen(function* () {
				const existing = yield* getActiveByPath(input.path);
				if (existing !== null) {
					return yield* Effect.fail(new WorkspacePathConflict({ path: input.path as string }));
				}
				const now = new Date().toISOString();
				yield* sqlite.run(
					"INSERT INTO workspaces (id, project_id, name, kind, path, branch, base_branch, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
					[
						input.id as string,
						input.projectId as string,
						input.name,
						input.kind,
						input.path as string,
						input.branch,
						input.baseBranch,
						now,
						now,
					],
				);
				return decodeRow({
					id: input.id as string,
					project_id: input.projectId as string,
					name: input.name,
					kind: input.kind,
					path: input.path as string,
					branch: input.branch,
					base_branch: input.baseBranch,
					created_at: now,
					updated_at: now,
					deleted_at: null,
				});
			});

		const softDelete = (id: WorkspaceId) =>
			Effect.gen(function* () {
				const now = new Date().toISOString();
				const result = yield* sqlite.run(
					"UPDATE workspaces SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
					[now, now, id as string],
				);
				if (result.changes === 0) {
					return yield* Effect.fail(new WorkspaceNotFound({ workspaceId: id as string }));
				}
			});

		return Workspaces.of({
			list,
			getById,
			getActiveByPath,
			create,
			softDelete,
		});
	}),
);
