import {
	AbsolutePath,
	InternalError,
	IsoDateTime,
	ProjectId,
	ProjectNotFound,
	ProjectPathConflict,
	ProjectPathInvalid,
	ProjectPathNotFound,
	ProjectReorderMismatch,
	type Project as ProjectWire,
} from "@sandcastle/contracts";
import {
	type ProjectPathConflict as ProjectPathConflictDb,
	Projects as ProjectsRepo,
	type SqliteError,
	Workspaces as WorkspacesRepo,
} from "@sandcastle/db";
import type { Project as ProjectEntity } from "@sandcastle/entities";
import { Context, Effect, Layer } from "effect";

import { newProjectId, newWorkspaceId } from "../lib/ids.ts";
import { isAbsolutePath, pathStat } from "../lib/paths.ts";

const toInternal = (cause: unknown): InternalError =>
	new InternalError({ message: cause instanceof Error ? cause.message : String(cause) });

const toWire = (p: ProjectEntity): ProjectWire => ({
	id: ProjectId.make(p.id),
	name: p.name,
	rootPath: AbsolutePath.make(p.rootPath),
	isGit: p.isGit,
	createdAt: IsoDateTime.make(p.createdAt),
	updatedAt: IsoDateTime.make(p.updatedAt),
});

const probeIsGit = (path: string): Effect.Effect<boolean> =>
	Effect.promise(async () => {
		try {
			const proc = Bun.spawn(["git", "-C", path, "rev-parse", "--is-inside-work-tree"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const code = await proc.exited;
			return code === 0;
		} catch {
			return false;
		}
	});

const removeWorktreeBestEffort = (projectRoot: string, worktreePath: string): Effect.Effect<void> =>
	Effect.promise(async () => {
		try {
			const proc = Bun.spawn(
				["git", "-C", projectRoot, "worktree", "remove", "--force", worktreePath],
				{ stdout: "pipe", stderr: "pipe" },
			);
			await proc.exited;
		} catch {
			// best-effort
		}
	});

export interface ProjectServiceShape {
	readonly list: () => Effect.Effect<ReadonlyArray<ProjectWire>, InternalError>;
	readonly create: (input: {
		readonly name: string;
		readonly rootPath: string;
	}) => Effect.Effect<
		ProjectWire,
		ProjectPathInvalid | ProjectPathNotFound | ProjectPathConflict | InternalError
	>;
	readonly rename: (
		projectId: ProjectId,
		name: string,
	) => Effect.Effect<ProjectWire, ProjectNotFound | InternalError>;
	readonly delete: (projectId: ProjectId) => Effect.Effect<void, ProjectNotFound | InternalError>;
	readonly reorder: (
		projectIds: ReadonlyArray<ProjectId>,
	) => Effect.Effect<void, ProjectReorderMismatch | InternalError>;
}

export class ProjectService extends Context.Service<ProjectService, ProjectServiceShape>()(
	"@sandcastle/server/ProjectService",
) {}

export const layer: Layer.Layer<ProjectService, never, ProjectsRepo | WorkspacesRepo> =
	Layer.effect(ProjectService)(
		Effect.gen(function* () {
			const projects = yield* ProjectsRepo;
			const workspaces = yield* WorkspacesRepo;

			const list: ProjectServiceShape["list"] = () =>
				projects.list().pipe(
					Effect.mapError(toInternal),
					Effect.map((rows) => rows.map(toWire)),
				);

			const create: ProjectServiceShape["create"] = (input) =>
				Effect.gen(function* () {
					if (!isAbsolutePath(input.rootPath)) {
						return yield* Effect.fail(
							new ProjectPathInvalid({
								path: input.rootPath,
								reason: "path must be absolute",
							}),
						);
					}
					const stat = yield* pathStat(input.rootPath);
					if (!stat.exists) {
						return yield* Effect.fail(new ProjectPathNotFound({ path: input.rootPath }));
					}
					if (!stat.isDirectory) {
						return yield* Effect.fail(
							new ProjectPathInvalid({
								path: input.rootPath,
								reason: "path is not a directory",
							}),
						);
					}

					const isGit = yield* probeIsGit(input.rootPath);
					const id = newProjectId();

					const created = yield* projects
						.create({
							id,
							name: input.name,
							rootPath: AbsolutePath.make(input.rootPath),
							isGit,
						})
						.pipe(
							Effect.catchTag("ProjectPathConflict", (err: ProjectPathConflictDb) =>
								Effect.fail(new ProjectPathConflict({ rootPath: err.rootPath })),
							),
							Effect.catchTag("SqliteError", (cause: SqliteError) =>
								Effect.fail(toInternal(cause)),
							),
						);

					yield* workspaces
						.create({
							id: newWorkspaceId(),
							projectId: id,
							name: "Local",
							kind: "local",
							path: AbsolutePath.make(input.rootPath),
							branch: null,
							baseBranch: null,
						})
						.pipe(
							Effect.catchTag("WorkspacePathConflict", () => Effect.void),
							Effect.catchTag("SqliteError", (cause: SqliteError) =>
								Effect.fail(toInternal(cause)),
							),
						);

					return toWire(created);
				});

			const rename: ProjectServiceShape["rename"] = (projectId, name) =>
				projects.rename(projectId, name).pipe(
					Effect.catchTag("ProjectNotFound", (e: { projectId: string }) =>
						Effect.fail(new ProjectNotFound({ projectId: e.projectId })),
					),
					Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
					Effect.map(toWire),
				);

			const del: ProjectServiceShape["delete"] = (projectId) =>
				Effect.gen(function* () {
					const project = yield* projects.getById(projectId).pipe(Effect.mapError(toInternal));
					if (project === null || project.deletedAt !== null) {
						return yield* Effect.fail(new ProjectNotFound({ projectId: projectId as string }));
					}

					const children = yield* workspaces.list({ projectId }).pipe(Effect.mapError(toInternal));

					// Best-effort tear down worktrees first.
					for (const child of children) {
						if (child.kind === "worktree") {
							yield* removeWorktreeBestEffort(
								project.rootPath as unknown as string,
								child.path as unknown as string,
							);
						}
					}

					// Soft-delete each child workspace row (ignore individual not-founds).
					for (const child of children) {
						yield* workspaces.softDelete(child.id).pipe(
							Effect.catchTag("WorkspaceNotFound", () => Effect.void),
							Effect.catchTag("SqliteError", (cause: SqliteError) =>
								Effect.fail(toInternal(cause)),
							),
						);
					}

					yield* projects.softDelete(projectId).pipe(
						Effect.catchTag("ProjectNotFound", (e: { projectId: string }) =>
							Effect.fail(new ProjectNotFound({ projectId: e.projectId })),
						),
						Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
					);
				});

			const reorder: ProjectServiceShape["reorder"] = (projectIds) =>
				projects.reorder(projectIds).pipe(
					Effect.catchTag("ProjectReorderMismatch", (err) =>
						Effect.fail(
							new ProjectReorderMismatch({
								expected: err.expected,
								got: err.got,
							}),
						),
					),
					Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
				);

			return ProjectService.of({ list, create, rename, delete: del, reorder });
		}),
	);
