import { Effect } from "effect";
import {
	type DatabaseError,
	ForeignKeyViolationError,
	WorktreeNotFoundError,
	WorktreePathExistsError,
} from "../errors";
import {
	type DbInstance,
	generateId,
	nowIso,
	type SQLQueryBindings,
	tryDb,
} from "../utils";
import { Worktree } from "./schema";

const rowToWorktree = (row: Record<string, unknown>): Worktree =>
	new Worktree({
		id: row.id as string,
		repositoryId: row.repository_id as string,
		path: row.path as string,
		branch: row.branch as string,
		name: row.name as string,
		baseBranch: row.base_branch as string,
		status: row.status as "active" | "stale" | "archived",
		createdAt: row.created_at as string,
		lastAccessedAt: row.last_accessed_at as string,
	});

export const createWorktreesService = (db: DbInstance) => ({
	list: () =>
		tryDb("worktrees.list", () =>
			db
				.query<Record<string, unknown>, []>(
					"SELECT * FROM worktrees ORDER BY created_at DESC",
				)
				.all()
				.map(rowToWorktree),
		),

	listByRepository: (repositoryId: string) =>
		tryDb("worktrees.listByRepository", () =>
			db
				.query<Record<string, unknown>, [string]>(
					"SELECT * FROM worktrees WHERE repository_id = ? ORDER BY created_at DESC",
				)
				.all(repositoryId)
				.map(rowToWorktree),
		),

	get: (id: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("worktrees.get", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM worktrees WHERE id = ?",
					)
					.get(id),
			);
			if (!row) {
				return yield* Effect.fail(new WorktreeNotFoundError({ id }));
			}
			return rowToWorktree(row);
		}),

	getByPath: (worktreePath: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("worktrees.getByPath", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM worktrees WHERE path = ?",
					)
					.get(worktreePath),
			);
			if (!row) {
				return yield* Effect.fail(
					new WorktreeNotFoundError({ id: worktreePath }),
				);
			}
			return rowToWorktree(row);
		}),

	create: (input: {
		repositoryId: string;
		path: string;
		branch: string;
		name: string;
		baseBranch: string;
		status?: "active" | "stale" | "archived";
	}) =>
		Effect.gen(function* () {
			const now = nowIso();
			const id = generateId();
			const status = input.status ?? "active";

			const existingPath = yield* tryDb("worktrees.create.checkPath", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT id FROM worktrees WHERE path = ?",
					)
					.get(input.path),
			);

			if (existingPath) {
				return yield* Effect.fail(
					new WorktreePathExistsError({ path: input.path }),
				);
			}

			const existingRepo = yield* tryDb("worktrees.create.checkRepo", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT id FROM repositories WHERE id = ?",
					)
					.get(input.repositoryId),
			);

			if (!existingRepo) {
				return yield* Effect.fail(
					new ForeignKeyViolationError({
						entity: "Worktree",
						foreignKey: "repositoryId",
						foreignId: input.repositoryId,
					}),
				);
			}

			yield* tryDb("worktrees.create", () =>
				db.run(
					`INSERT INTO worktrees (id, repository_id, path, branch, name, base_branch, status, created_at, last_accessed_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[
						id,
						input.repositoryId,
						input.path,
						input.branch,
						input.name,
						input.baseBranch,
						status,
						now,
						now,
					],
				),
			);

			return new Worktree({
				id,
				repositoryId: input.repositoryId,
				path: input.path,
				branch: input.branch,
				name: input.name,
				baseBranch: input.baseBranch,
				status,
				createdAt: now,
				lastAccessedAt: now,
			});
		}),

	update: (
		id: string,
		input: {
			status?: "active" | "stale" | "archived";
			lastAccessedAt?: string;
		},
		getWorktree: (
			id: string,
		) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			const existing = yield* getWorktree(id);

			const updates: string[] = [];
			const values: SQLQueryBindings[] = [];

			if (input.status !== undefined) {
				updates.push("status = ?");
				values.push(input.status);
			}
			if (input.lastAccessedAt !== undefined) {
				updates.push("last_accessed_at = ?");
				values.push(input.lastAccessedAt);
			}

			if (updates.length === 0) return existing;

			values.push(id);

			yield* tryDb("worktrees.update", () =>
				db.run(
					`UPDATE worktrees SET ${updates.join(", ")} WHERE id = ?`,
					values,
				),
			);

			return new Worktree({
				...existing,
				status: input.status ?? existing.status,
				lastAccessedAt: input.lastAccessedAt ?? existing.lastAccessedAt,
			});
		}),

	delete: (
		id: string,
		getWorktree: (
			id: string,
		) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getWorktree(id);
			yield* tryDb("worktrees.delete", () =>
				db.run("DELETE FROM worktrees WHERE id = ?", [id]),
			);
		}),

	touch: (
		id: string,
		getWorktree: (
			id: string,
		) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getWorktree(id);
			yield* tryDb("worktrees.touch", () =>
				db.run("UPDATE worktrees SET last_accessed_at = ? WHERE id = ?", [
					nowIso(),
					id,
				]),
			);
		}),
});
