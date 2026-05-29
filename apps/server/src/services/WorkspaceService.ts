import { realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
	WorkspacePathUnresolved,
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
	/**
	 * Find-or-create the workspace that owns an absolute filesystem path,
	 * WITHOUT touching the git working copy (no `git worktree add`). Resolves
	 * the path to its git worktree root, matches the owning Sandcastle project
	 * via the shared git-common-dir, and idempotently returns (or inserts) the
	 * matching workspace row. Powers the MCP "teleport" flow: when a terminal's
	 * cwd moves into a worktree, Sandcastle re-groups it under this workspace.
	 */
	readonly upsertForPath: (
		path: string,
	) => Effect.Effect<WorkspaceWire, WorkspacePathUnresolved | InternalError>;
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
					return yield* Effect.fail(new WorkspaceNotFound({ workspaceId: workspaceId as string }));
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

		const unresolved = (path: string, reason: string) =>
			Effect.fail(new WorkspacePathUnresolved({ path, reason }));

		// git always reports canonical (symlink-resolved) paths, but Project.rootPath
		// is stored verbatim from what the user picked/typed. Canonicalize both sides
		// before comparing so e.g. /tmp vs /private/tmp (macOS) or a symlinked repo
		// dir still match. Falls back to the raw path if realpath fails.
		const canonical = (p: string): Effect.Effect<string> =>
			Effect.promise(() => realpath(p).catch(() => p));

		const upsertForPath: WorkspaceServiceShape["upsertForPath"] = (inputPath) =>
			Effect.gen(function* () {
				// 1. The path must live inside a git work tree.
				const inside = yield* runGit(inputPath, ["rev-parse", "--is-inside-work-tree"]);
				if (inside.code !== 0 || inside.stdout.trim() !== "true") {
					return yield* unresolved(inputPath, "not inside a git work tree");
				}

				// 2. Resolve this worktree's own root and the shared (main) git dir.
				const top = yield* runGit(inputPath, ["rev-parse", "--show-toplevel"]);
				if (top.code !== 0) {
					return yield* unresolved(inputPath, "could not resolve worktree root");
				}
				const worktreeRoot = top.stdout.trim();

				const commonDir = yield* runGit(inputPath, [
					"rev-parse",
					"--path-format=absolute",
					"--git-common-dir",
				]);
				if (commonDir.code !== 0) {
					return yield* unresolved(inputPath, "could not resolve git-common-dir");
				}
				const commonDirPath = commonDir.stdout.trim();
				// Candidate project roots, all canonical (git output): for a normal repo
				// the common dir is `<root>/.git` so the root is its parent; for a BARE
				// repo the common dir IS the repo dir; and the project may have been
				// registered at the worktree root itself. Try them in that order.
				const rootCandidates = [...new Set([dirname(commonDirPath), commonDirPath, worktreeRoot])];

				// 3. Match the owning project. Exact root_path match first (fast path),
				//    then a canonical (realpath) comparison to tolerate symlinked roots.
				const project = yield* Effect.gen(function* () {
					for (const candidate of rootCandidates) {
						const p = yield* projects
							.getActiveByRootPath(AbsolutePath.make(candidate))
							.pipe(Effect.mapError(toInternal));
						if (p !== null) return p;
					}
					const candidateSet = new Set(rootCandidates);
					const all = yield* projects.list().pipe(Effect.mapError(toInternal));
					for (const p of all) {
						const real = yield* canonical(p.rootPath as unknown as string);
						if (candidateSet.has(real)) return p;
					}
					return null;
				});
				if (project === null) {
					return yield* unresolved(inputPath, `no Sandcastle project owns ${commonDirPath}`);
				}

				// 4. Idempotent: a workspace already tracks this worktree root.
				const existing = yield* workspaces
					.getActiveByPath(AbsolutePath.make(worktreeRoot))
					.pipe(Effect.mapError(toInternal));
				if (existing !== null) {
					return toWire(existing);
				}

				const projectRootReal = yield* canonical(project.rootPath as unknown as string);
				const isLocal = worktreeRoot === projectRootReal;

				// The local workspace may already exist with a non-canonical stored path
				// (so the getActiveByPath check above missed it); return it instead of
				// inserting a duplicate.
				if (isLocal) {
					const siblings = yield* workspaces
						.list({ projectId: ProjectId.make(project.id as unknown as string) })
						.pipe(Effect.mapError(toInternal));
					const localExisting = siblings.find((w) => w.kind === "local");
					if (localExisting) return toWire(localExisting);
				}

				// Branch metadata is best-effort; a detached HEAD reports "HEAD".
				let branch: string | null = null;
				const head = yield* runGit(worktreeRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
				if (head.code === 0) {
					const b = head.stdout.trim();
					branch = b.length > 0 && b !== "HEAD" ? b : null;
				}
				let baseBranch: string | null = null;
				const upstream = yield* runGit(worktreeRoot, [
					"rev-parse",
					"--abbrev-ref",
					"--symbolic-full-name",
					"@{upstream}",
				]);
				if (upstream.code === 0) {
					const u = upstream.stdout.trim();
					baseBranch = u.length > 0 ? u : null;
				}

				const name = isLocal ? project.name : (branch ?? basename(worktreeRoot));

				const inserted = yield* workspaces
					.create({
						id: newWorkspaceId(),
						projectId: ProjectId.make(project.id as unknown as string),
						name,
						kind: isLocal ? "local" : "worktree",
						path: AbsolutePath.make(worktreeRoot),
						branch,
						baseBranch,
					})
					.pipe(
						// A concurrent caller may have inserted the same path between our
						// getActiveByPath check and here — fetch and return theirs. We did
						// NOT create the worktree on disk, so never remove it on failure.
						Effect.catchTag("WorkspacePathConflict", () =>
							workspaces.getActiveByPath(AbsolutePath.make(worktreeRoot)).pipe(
								Effect.mapError(toInternal),
								Effect.flatMap((row) =>
									row === null
										? Effect.fail(
												toInternal(
													new Error(`workspace path conflict but row missing: ${worktreeRoot}`),
												),
											)
										: Effect.succeed(row),
								),
							),
						),
						Effect.catchTag("SqliteError", (cause: SqliteError) => Effect.fail(toInternal(cause))),
					);

				return toWire(inserted);
			});

		return WorkspaceService.of({ list, get, create, delete: del, upsertForPath });
	}),
);
