import type { AbsolutePath, IsoDateTime, Project, ProjectId } from "@sandcastle/entities";
import { Context, Effect, Layer } from "effect";
import { Sqlite } from "../client.ts";
import { ProjectNotFound, ProjectPathConflict, type SqliteError } from "../errors.ts";

interface ProjectRow {
	readonly id: string;
	readonly name: string;
	readonly root_path: string;
	readonly is_git: number;
	readonly created_at: string;
	readonly updated_at: string;
	readonly deleted_at: string | null;
}

const decodeRow = (row: ProjectRow): Project => ({
	id: row.id as ProjectId,
	name: row.name,
	rootPath: row.root_path as AbsolutePath,
	isGit: row.is_git !== 0,
	createdAt: row.created_at as IsoDateTime,
	updatedAt: row.updated_at as IsoDateTime,
	deletedAt: (row.deleted_at ?? null) as IsoDateTime | null,
});

export interface CreateProjectInput {
	readonly id: ProjectId;
	readonly name: string;
	readonly rootPath: AbsolutePath;
	readonly isGit: boolean;
}

export class Projects extends Context.Service<
	Projects,
	{
		readonly list: () => Effect.Effect<ReadonlyArray<Project>, SqliteError>;
		readonly getById: (id: ProjectId) => Effect.Effect<Project | null, SqliteError>;
		readonly getActiveByRootPath: (
			rootPath: AbsolutePath,
		) => Effect.Effect<Project | null, SqliteError>;
		readonly create: (
			input: CreateProjectInput,
		) => Effect.Effect<Project, SqliteError | ProjectPathConflict>;
		readonly rename: (
			id: ProjectId,
			name: string,
		) => Effect.Effect<Project, SqliteError | ProjectNotFound>;
		readonly softDelete: (id: ProjectId) => Effect.Effect<void, SqliteError | ProjectNotFound>;
	}
>()("@sandcastle/db/Projects") {}

export const layer: Layer.Layer<Projects, never, Sqlite> = Layer.effect(Projects)(
	Effect.gen(function* () {
		const sqlite = yield* Sqlite;

		const list = () =>
			sqlite
				.query<ProjectRow>(
					"SELECT id, name, root_path, is_git, created_at, updated_at, deleted_at FROM projects WHERE deleted_at IS NULL ORDER BY created_at ASC",
				)
				.pipe(Effect.map((rows) => rows.map(decodeRow)));

		const getById = (id: ProjectId) =>
			sqlite
				.queryOne<ProjectRow>(
					"SELECT id, name, root_path, is_git, created_at, updated_at, deleted_at FROM projects WHERE id = ?",
					[id as string],
				)
				.pipe(Effect.map((row) => (row === null ? null : decodeRow(row))));

		const getActiveByRootPath = (rootPath: AbsolutePath) =>
			sqlite
				.queryOne<ProjectRow>(
					"SELECT id, name, root_path, is_git, created_at, updated_at, deleted_at FROM projects WHERE root_path = ? AND deleted_at IS NULL",
					[rootPath as string],
				)
				.pipe(Effect.map((row) => (row === null ? null : decodeRow(row))));

		const create = (input: CreateProjectInput) =>
			Effect.gen(function* () {
				const existing = yield* getActiveByRootPath(input.rootPath);
				if (existing !== null) {
					return yield* Effect.fail(
						new ProjectPathConflict({ rootPath: input.rootPath as string }),
					);
				}
				const now = new Date().toISOString();
				yield* sqlite.run(
					"INSERT INTO projects (id, name, root_path, is_git, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
					[input.id as string, input.name, input.rootPath as string, input.isGit ? 1 : 0, now, now],
				);
				return decodeRow({
					id: input.id as string,
					name: input.name,
					root_path: input.rootPath as string,
					is_git: input.isGit ? 1 : 0,
					created_at: now,
					updated_at: now,
					deleted_at: null,
				});
			});

		const rename = (id: ProjectId, name: string) =>
			Effect.gen(function* () {
				const now = new Date().toISOString();
				const result = yield* sqlite.run(
					"UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
					[name, now, id as string],
				);
				if (result.changes === 0) {
					return yield* Effect.fail(new ProjectNotFound({ projectId: id as string }));
				}
				const row = yield* getById(id);
				if (row === null) {
					return yield* Effect.fail(new ProjectNotFound({ projectId: id as string }));
				}
				return row;
			});

		const softDelete = (id: ProjectId) =>
			Effect.gen(function* () {
				const now = new Date().toISOString();
				const result = yield* sqlite.run(
					"UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
					[now, now, id as string],
				);
				if (result.changes === 0) {
					return yield* Effect.fail(new ProjectNotFound({ projectId: id as string }));
				}
			});

		return Projects.of({
			list,
			getById,
			getActiveByRootPath,
			create,
			rename,
			softDelete,
		});
	}),
);
