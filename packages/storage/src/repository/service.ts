import { Repository } from "@sandcastle/schemas";
import { Effect, Option } from "effect";
import {
	type DatabaseError,
	RepositoryNotFoundError,
	RepositoryPathExistsError,
} from "../errors";
import {
	type DbInstance,
	generateId,
	nowIso,
	type SQLQueryBindings,
	tryDb,
} from "../utils";

const rowToRepository = (row: Record<string, unknown>): Repository =>
	new Repository({
		id: row.id as string,
		label: row.label as string,
		directoryPath: row.directoryPath as string,
		defaultBranch: row.defaultBranch as string,
		pinned: Boolean(row.pinned),
		worktreeInitScript: row.worktreeInitScript
			? Option.some(row.worktreeInitScript as string)
			: Option.none(),
		createdAt: row.createdAt as string,
		updatedAt: row.updatedAt as string,
	});

export const createRepositoriesService = (db: DbInstance) => ({
	list: () =>
		tryDb("repositories.list", () =>
			db
				.query<Record<string, unknown>, []>(
					"SELECT * FROM repositories ORDER BY pinned DESC, createdAt DESC",
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
						"SELECT * FROM repositories WHERE directoryPath = ?",
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
						"SELECT id FROM repositories WHERE directoryPath = ?",
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
					`INSERT INTO repositories (id, label, directoryPath, defaultBranch, pinned, createdAt, updatedAt)
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
				worktreeInitScript: Option.none(),
				createdAt: now,
				updatedAt: now,
			});
		}),

	update: (
		id: string,
		input: {
			label?: string;
			defaultBranch?: string;
			pinned?: boolean;
			worktreeInitScript?: string;
		},
		getRepository: (
			id: string,
		) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>,
	) =>
		Effect.gen(function* () {
			const existing = yield* getRepository(id);
			const now = nowIso();

			const updates: string[] = ["updatedAt = ?"];
			const values: SQLQueryBindings[] = [now];

			if (input.label !== undefined) {
				updates.push("label = ?");
				values.push(input.label);
			}
			if (input.defaultBranch !== undefined) {
				updates.push("defaultBranch = ?");
				values.push(input.defaultBranch);
			}
			if (input.pinned !== undefined) {
				updates.push("pinned = ?");
				values.push(input.pinned ? 1 : 0);
			}
			if (input.worktreeInitScript !== undefined) {
				updates.push("worktreeInitScript = ?");
				values.push(input.worktreeInitScript);
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
				worktreeInitScript:
					input.worktreeInitScript !== undefined
						? Option.some(input.worktreeInitScript)
						: existing.worktreeInitScript,
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
