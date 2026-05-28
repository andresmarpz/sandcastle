import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Result } from "effect";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { ProjectService } from "../src/services/ProjectService.ts";
import { WorkspaceService } from "../src/services/WorkspaceService.ts";
import { initGitRepo, makeHarness, makeTempDir, type TestHarness } from "./setup.ts";

describe("WorkspaceService", () => {
	let h: TestHarness;
	const tmpDirs: Array<string> = [];

	const ephemeralDir = (): string => {
		const dir = makeTempDir("sandcastle-test-workspace-");
		tmpDirs.push(dir);
		return dir;
	};

	beforeEach(() => {
		h = makeHarness();
	});
	afterEach(async () => {
		await h.dispose();
		await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
	});

	test("list rejects unknown project with ProjectNotFound", async () => {
		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const workspaces = yield* WorkspaceService;
				return yield* Effect.result(
					// biome-ignore lint/suspicious/noExplicitAny: branded id, runtime check
					workspaces.list("00000000-0000-0000-0000-000000000000" as any),
				);
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("ProjectNotFound");
		}
	});

	test("list returns only workspaces belonging to the project", async () => {
		const dir1 = ephemeralDir();
		const dir2 = ephemeralDir();

		const { p1Ids, p2Ids } = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const workspaces = yield* WorkspaceService;
				const p1 = yield* projects.create({ name: "one", rootPath: dir1 });
				const p2 = yield* projects.create({ name: "two", rootPath: dir2 });
				const w1 = yield* workspaces.create({
					projectId: p1.id,
					name: "p1-local",
					config: { _tag: "local" },
				});
				const w2 = yield* workspaces.create({
					projectId: p2.id,
					name: "p2-local",
					config: { _tag: "local" },
				});

				const p1List = yield* workspaces.list(p1.id);
				const p2List = yield* workspaces.list(p2.id);
				return {
					p1Ids: { listed: p1List.map((w) => w.id), expected: w1.id },
					p2Ids: { listed: p2List.map((w) => w.id), expected: w2.id },
				};
			}),
		);

		expect(p1Ids.listed).toEqual([p1Ids.expected]);
		expect(p2Ids.listed).toEqual([p2Ids.expected]);
	});

	test("create local: path equals project rootPath, kind is local, branch is null", async () => {
		const dir = ephemeralDir();

		const workspace = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const workspaces = yield* WorkspaceService;
				const project = yield* projects.create({ name: "p", rootPath: dir });
				return yield* workspaces.create({
					projectId: project.id,
					name: "main",
					config: { _tag: "local" },
				});
			}),
		);

		expect(workspace.kind).toBe("local");
		expect(workspace.path).toBe(dir);
		expect(workspace.branch).toBeNull();
		expect(workspace.baseBranch).toBeNull();
	});

	test("create rejects a second local workspace with WorkspaceLocalConflict", async () => {
		const dir = ephemeralDir();

		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const workspaces = yield* WorkspaceService;
				const project = yield* projects.create({ name: "p", rootPath: dir });
				yield* workspaces.create({
					projectId: project.id,
					name: "first",
					config: { _tag: "local" },
				});
				return yield* Effect.result(
					workspaces.create({
						projectId: project.id,
						name: "second",
						config: { _tag: "local" },
					}),
				);
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("WorkspaceLocalConflict");
		}
	});

	test("create worktree against a non-git project fails with WorkspaceNotGit", async () => {
		const dir = ephemeralDir();

		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const workspaces = yield* WorkspaceService;
				const project = yield* projects.create({ name: "p", rootPath: dir });
				return yield* Effect.result(
					workspaces.create({
						projectId: project.id,
						name: "feature",
						config: { _tag: "worktree" },
					}),
				);
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("WorkspaceNotGit");
		}
	});

	test("create worktree against a git project: directory + branch are created on disk", async () => {
		const repo = ephemeralDir();
		await initGitRepo(repo);

		const workspace = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const workspaces = yield* WorkspaceService;
				const project = yield* projects.create({ name: "repo", rootPath: repo });
				return yield* workspaces.create({
					projectId: project.id,
					name: "feature",
					config: { _tag: "worktree", branch: "feature/x" },
				});
			}),
		);

		expect(workspace.kind).toBe("worktree");
		expect(workspace.branch).toBe("feature/x");
		expect(workspace.path.startsWith(h.worktreesDir)).toBe(true);
		// `git worktree add` produces a `.git` file (not a dir) at the worktree root.
		expect(existsSync(join(workspace.path as unknown as string, ".git"))).toBe(true);

		// Verify the branch shows up in the source repo's branch list.
		const proc = Bun.spawn(["git", "-C", repo, "branch", "--list", "feature/x"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		await proc.exited;
		expect(stdout).toContain("feature/x");
	});

	test("delete worktree removes the on-disk directory and soft-deletes the row", async () => {
		const repo = ephemeralDir();
		await initGitRepo(repo);

		const { worktreePath, projectId } = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const workspaces = yield* WorkspaceService;
				const project = yield* projects.create({ name: "repo", rootPath: repo });
				const w = yield* workspaces.create({
					projectId: project.id,
					name: "feature",
					config: { _tag: "worktree" },
				});
				yield* workspaces.delete(w.id);
				return { worktreePath: w.path as unknown as string, projectId: project.id };
			}),
		);

		expect(existsSync(worktreePath)).toBe(false);

		const remaining = await h.runtime.runPromise(
			Effect.gen(function* () {
				const workspaces = yield* WorkspaceService;
				return yield* workspaces.list(projectId);
			}),
		);
		expect(remaining).toEqual([]);
	});
});
