import { Effect } from "effect";

import { Repository } from "./entities";
import {
	type DatabaseError,
	RepositoryNotFoundError,
	RepositoryPathExistsError,
} from "./errors";
import {
	type DbInstance,
	generateId,
	nowIso,
	type SQLQueryBindings,
	tryDb,
} from "./utils";

const rowToRepository = (row: Record<string, unknown>): Repository =>
	new Repository({
		id: row.id as string,
		label: row.label as string,
		directoryPath: row.directory_path as string,
		defaultBranch: row.default_branch as string,
		pinned: Boolean(row.pinned),
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
	});

export const createRepositoriesService = (db: DbInstance) => ({
	list: () =>
		tryDb("repositories.list", () =>
			db
				.query<Record<string, unknown>, []>(
					"SELECT * FROM repositories ORDER BY pinned DESC, created_at DESC",
				)
				.all()
				.map(rowToRepository),
		),

	get: (id: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("repositories.get", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM repositories WHERE id = ?",
					)
					.get(id),
			);
			if (!row) {
				return yield* Effect.fail(new RepositoryNotFoundError({ id }));
			}
			return rowToRepository(row);
		}),

	getByPath: (directoryPath: string) =>
		Effect.gen(function* () {
			const row = yield* tryDb("repositories.getByPath", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT * FROM repositories WHERE directory_path = ?",
					)
					.get(directoryPath),
			);
			if (!row) {
				return yield* Effect.fail(
					new RepositoryNotFoundError({ id: directoryPath }),
				);
			}
			return rowToRepository(row);
		}),

	create: (input: {
		label: string;
		directoryPath: string;
		defaultBranch?: string;
	}) =>
		Effect.gen(function* () {
			const now = nowIso();
			const id = generateId();
			const defaultBranch = input.defaultBranch ?? "main";

			const existing = yield* tryDb("repositories.create.check", () =>
				db
					.query<Record<string, unknown>, [string]>(
						"SELECT id FROM repositories WHERE directory_path = ?",
					)
					.get(input.directoryPath),
			);

			if (existing) {
				return yield* Effect.fail(
					new RepositoryPathExistsError({
						directoryPath: input.directoryPath,
					}),
				);
			}

			yield* tryDb("repositories.create", () =>
				db.run(
					`INSERT INTO repositories (id, label, directory_path, default_branch, pinned, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
					[id, input.label, input.directoryPath, defaultBranch, 0, now, now],
				),
			);

			return new Repository({
				id,
				label: input.label,
				directoryPath: input.directoryPath,
				defaultBranch,
				pinned: false,
				createdAt: now,
				updatedAt: now,
			});
		}),

	update: (
		id: string,
		input: { label?: string; defaultBranch?: string; pinned?: boolean },
		getRepository: (
			id: string,
		) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			const existing = yield* getRepository(id);
			const now = nowIso();

			const updates: string[] = ["updated_at = ?"];
			const values: SQLQueryBindings[] = [now];

			if (input.label !== undefined) {
				updates.push("label = ?");
				values.push(input.label);
			}
			if (input.defaultBranch !== undefined) {
				updates.push("default_branch = ?");
				values.push(input.defaultBranch);
			}
			if (input.pinned !== undefined) {
				updates.push("pinned = ?");
				values.push(input.pinned ? 1 : 0);
			}

			values.push(id);

			yield* tryDb("repositories.update", () =>
				db.run(
					`UPDATE repositories SET ${updates.join(", ")} WHERE id = ?`,
					values,
				),
			);

			return new Repository({
				...existing,
				label: input.label ?? existing.label,
				defaultBranch: input.defaultBranch ?? existing.defaultBranch,
				pinned: input.pinned ?? existing.pinned,
				updatedAt: now,
			});
		}),

	delete: (
		id: string,
		getRepository: (
			id: string,
		) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			yield* getRepository(id);
			yield* tryDb("repositories.delete", () =>
				db.run("DELETE FROM repositories WHERE id = ?", [id]),
			);
		}),
});
