import { join } from "node:path";
import {
	AbsolutePath,
	InternalError,
	IsoDateTime,
	ProjectId,
	ProjectNotFound,
	type WorkspaceCreateConfig,
	WorkspaceId,
	WorkspaceLocalConflict,
	WorkspaceNotFound,
	WorkspaceNotGit,
	type Workspace as WorkspaceWire,
	WorktreeCreateFailed,
} from "@sandcastle/contracts";
import {
	Projects as ProjectsRepo,
	type SqliteError,
	type WorkspacePathConflict as WorkspacePathConflictDb,
	Workspaces as WorkspacesRepo,
} from "@sandcastle/db";
import type { Workspace as WorkspaceEntity } from "@sandcastle/entities";
import { Context, Effect, Layer } from "effect";

import { ServerConfig } from "../config/ConfigService.ts";
import { newWorkspaceId } from "../lib/ids.ts";

const slugify = (input: string): string => {
	const slug = input
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug.length > 0 ? slug : "workspace";
};

const toInternal = (cause: unknown): InternalError =>
	new InternalError({ message: cause instanceof Error ? cause.message : String(cause) });

const toWire = (w: WorkspaceEntity): WorkspaceWire => ({
	id: WorkspaceId.make(w.id),
	projectId: ProjectId.make(w.projectId),
	name: w.name,
	kind: w.kind,
	path: AbsolutePath.make(w.path),
	branch: w.branch,
	baseBranch: w.baseBranch,
	createdAt: IsoDateTime.make(w.createdAt),
	updatedAt: IsoDateTime.make(w.updatedAt),
});

interface ProcOutput {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

const runGit = (
	cwd: string,
	args: ReadonlyArray<string>,
): Effect.Effect<ProcOutput, InternalError> =>
	Effect.tryPromise({
		try: async () => {
			const proc = Bun.spawn(["git", "-C", cwd, ...args], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const [stdout, stderr, code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			return { code, stdout, stderr } satisfies ProcOutput;
		},
		catch: (cause) => toInternal(cause),
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

export interface WorkspaceServiceShape {
	readonly list: (
		projectId: ProjectId,
	) => Effect.Effect<ReadonlyArray<WorkspaceWire>, ProjectNotFound | InternalError>;
	readonly get: (
		workspaceId: WorkspaceId,
	) => Effect.Effect<WorkspaceWire, WorkspaceNotFound | InternalError>;
	readonly create: (input: {
		readonly projectId: ProjectId;
		readonly name: string;
		readonly config: WorkspaceCreateConfig;
	}) => Effect.Effect<
		WorkspaceWire,
		| ProjectNotFound
		| WorkspaceNotGit
		| WorkspaceLocalConflict
		| WorktreeCreateFailed
		| InternalError
	>;
	readonly delete: (
		workspaceId: WorkspaceId,
	) => Effect.Effect<void, WorkspaceNotFound | InternalError>;
}

export class WorkspaceService extends Context.Service<WorkspaceService, WorkspaceServiceShape>()(
	"@sandcastle/server/WorkspaceService",
) {}

export const layer: Layer.Layer<
	WorkspaceService,
	never,
	ProjectsRepo | WorkspacesRepo | ServerConfig
> = Layer.effect(WorkspaceService)(
	Effect.gen(function* () {
		const projects = yield* ProjectsRepo;
		const workspaces = yield* WorkspacesRepo;
		const config = yield* ServerConfig;

		const list: WorkspaceServiceShape["list"] = (projectId) =>
			Effect.gen(function* () {
				const project = yield* projects.getById(projectId).pipe(Effect.mapError(toInternal));
				if (project === null || project.deletedAt !== null) {
					return yield* Effect.fail(new ProjectNotFound({ projectId: projectId as string }));
				}
				const rows = yield* workspaces.list({ projectId }).pipe(Effect.mapError(toInternal));
				return rows.map(toWire);
			});

		const get: WorkspaceServiceShape["get"] = (workspaceId) =>
			Effect.gen(function* () {
				const row = yield* workspaces.getById(workspaceId).pipe(Effect.mapError(toInternal));
				if (row === null || row.deletedAt !== null) {
					return yield* Effect.fail(
						new WorkspaceNotFound({ workspaceId: workspaceId as string }),
					);
				}
				return toWire(row);
			});

		const create: WorkspaceServiceShape["create"] = (input) =>
			Effect.gen(function* () {
				const project = yield* projects.getById(input.projectId).pipe(Effect.mapError(toInternal));
				if (project === null || project.deletedAt !== null) {
					return yield* Effect.fail(new ProjectNotFound({ projectId: input.projectId as string }));
				}

				const workspaceId = newWorkspaceId();
				let path: string;
				let branch: string | null;
				let baseBranch: string | null;
				let kind: "local" | "worktree";
				let createdOnDisk = false;

				if (input.config._tag === "local") {
					const existing = yield* workspaces
						.list({ projectId: input.projectId })
						.pipe(Effect.mapError(toInternal));
					if (existing.some((w) => w.kind === "local")) {
						return yield* Effect.fail(
							new WorkspaceLocalConflict({ projectId: input.projectId as string }),
						);
					}
					path = project.rootPath as unknown as string;
					branch = null;
					baseBranch = null;
					kind = "local";
				} else {
					if (!project.isGit) {
						return yield* Effect.fail(
							new WorkspaceNotGit({ projectId: input.projectId as string }),
						);
					}

					path = join(
						config.worktreesDir,
						input.projectId as unknown as string,
						workspaceId as unknown as string,
					);

					if (input.config.branch !== undefined) {
						branch = input.config.branch;
					} else {
						const base = `sandcastle/${slugify(input.name)}`;
						branch = base;
						for (let suffix = 2; suffix < 100; suffix++) {
							const ref = yield* runGit(project.rootPath as unknown as string, [
								"show-ref",
								"--verify",
								"--quiet",
								`refs/heads/${branch}`,
							]);
							if (ref.code !== 0) break;
							branch = `${base}-${suffix}`;
						}
					}

					if (input.config.baseBranch !== undefined) {
						baseBranch = input.config.baseBranch;
					} else {
						const head = yield* runGit(project.rootPath as unknown as string, [
							"rev-parse",
							"HEAD",
						]);
						if (head.code !== 0) {
							return yield* Effect.fail(
								new WorktreeCreateFailed({
									message: head.stderr.trim() || "failed to resolve project HEAD",
								}),
							);
						}
						baseBranch = head.stdout.trim();
					}

					const add = yield* runGit(project.rootPath as unknown as string, [
						"worktree",
						"add",
						"-b",
						branch,
						path,
						baseBranch,
					]);
					if (add.code !== 0) {
						return yield* Effect.fail(
							new WorktreeCreateFailed({
								message: add.stderr.trim() || "git worktree add failed",
							}),
						);
					}
					createdOnDisk = true;
					kind = "worktree";
				}

				const inserted = yield* workspaces
					.create({
						id: workspaceId,
						projectId: input.projectId,
						name: input.name,
						kind,
						path: AbsolutePath.make(path),
						branch,
						baseBranch,
					})
					.pipe(
						Effect.catchTag("WorkspacePathConflict", (err: WorkspacePathConflictDb) =>
							Effect.fail(toInternal(new Error(`workspace path conflict: ${err.path}`))),
						),
						Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
						Effect.tapError(() =>
							createdOnDisk
								? removeWorktreeBestEffort(project.rootPath as unknown as string, path)
								: Effect.void,
						),
					);

				return toWire(inserted);
			});

		const del: WorkspaceServiceShape["delete"] = (workspaceId) =>
			Effect.gen(function* () {
				const workspace = yield* workspaces.getById(workspaceId).pipe(Effect.mapError(toInternal));
				if (workspace === null || workspace.deletedAt !== null) {
					return yield* Effect.fail(new WorkspaceNotFound({ workspaceId: workspaceId as string }));
				}

				if (workspace.kind === "worktree") {
					const project = yield* projects
						.getById(workspace.projectId)
						.pipe(Effect.mapError(toInternal));
					if (project !== null) {
						yield* removeWorktreeBestEffort(
							project.rootPath as unknown as string,
							workspace.path as unknown as string,
						);
					}
				}

				yield* workspaces.softDelete(workspaceId).pipe(
					Effect.catchTag("WorkspaceNotFound", (e: { workspaceId: string }) =>
						Effect.fail(new WorkspaceNotFound({ workspaceId: e.workspaceId })),
					),
					Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
				);
			});

		return WorkspaceService.of({ list, get, create, delete: del });
	}),
);
