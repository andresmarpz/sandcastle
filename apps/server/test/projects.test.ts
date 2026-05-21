import { writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Result } from "effect";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { ProjectService } from "../src/services/ProjectService.ts";
import { WorkspaceService } from "../src/services/WorkspaceService.ts";
import { initGitRepo, makeHarness, makeTempDir, type TestHarness } from "./setup.ts";

describe("ProjectService", () => {
	let h: TestHarness;
	const tmpDirs: Array<string> = [];

	const ephemeralDir = (): string => {
		const dir = makeTempDir("sandcastle-test-project-");
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

	test("create rejects relative paths with ProjectPathInvalid", async () => {
		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				return yield* Effect.result(projects.create({ name: "p", rootPath: "relative/path" }));
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("ProjectPathInvalid");
		}
	});

	test("create rejects nonexistent paths with ProjectPathNotFound", async () => {
		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				return yield* Effect.result(
					projects.create({ name: "p", rootPath: "/this/does/not/exist/anywhere" }),
				);
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("ProjectPathNotFound");
		}
	});

	test("create rejects paths pointing at a file (not a directory)", async () => {
		const dir = ephemeralDir();
		const filePath = join(dir, "file.txt");
		writeFileSync(filePath, "hello");

		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				return yield* Effect.result(projects.create({ name: "p", rootPath: filePath }));
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("ProjectPathInvalid");
		}
	});

	test("create probes isGit correctly for git and non-git directories", async () => {
		const plain = ephemeralDir();
		const repo = ephemeralDir();
		await initGitRepo(repo);

		const { plainProject, repoProject } = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const plainProject = yield* projects.create({ name: "plain", rootPath: plain });
				const repoProject = yield* projects.create({ name: "repo", rootPath: repo });
				return { plainProject, repoProject };
			}),
		);

		expect(plainProject.isGit).toBe(false);
		expect(repoProject.isGit).toBe(true);
	});

	test("create rejects a second project at the same active rootPath", async () => {
		const dir = ephemeralDir();

		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				yield* projects.create({ name: "first", rootPath: dir });
				return yield* Effect.result(projects.create({ name: "second", rootPath: dir }));
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("ProjectPathConflict");
		}
	});

	test("rename returns ProjectNotFound for an unknown id", async () => {
		const result = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				return yield* Effect.result(
					// biome-ignore lint/suspicious/noExplicitAny: branded id, runtime check
					projects.rename("00000000-0000-0000-0000-000000000000" as any, "new"),
				);
			}),
		);
		expect(Result.isFailure(result)).toBe(true);
		if (Result.isFailure(result)) {
			expect(result.failure._tag).toBe("ProjectNotFound");
		}
	});

	test("rename updates the project's name and is visible via list", async () => {
		const dir = ephemeralDir();

		const renamed = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const created = yield* projects.create({ name: "old name", rootPath: dir });
				yield* projects.rename(created.id, "new name");
				const list = yield* projects.list();
				return list.find((p) => p.id === created.id);
			}),
		);
		expect(renamed?.name).toBe("new name");
	});

	test("delete cascades: removes worktrees on disk and soft-deletes the project", async () => {
		const repo = ephemeralDir();
		await initGitRepo(repo);

		const { worktreePath, projectId } = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				const workspaces = yield* WorkspaceService;

				const project = yield* projects.create({ name: "repo", rootPath: repo });
				const worktree = yield* workspaces.create({
					projectId: project.id,
					name: "feature",
					config: { _tag: "worktree" },
				});

				yield* projects.delete(project.id);

				return { worktreePath: worktree.path as unknown as string, projectId: project.id };
			}),
		);

		// Worktree directory should be removed from disk.
		expect(await Bun.file(join(worktreePath, ".git")).exists()).toBe(false);

		// Deleted project shouldn't appear in list().
		const remaining = await h.runtime.runPromise(
			Effect.gen(function* () {
				const projects = yield* ProjectService;
				return yield* projects.list();
			}),
		);
		expect(remaining.find((p) => p.id === projectId)).toBeUndefined();
	});
});
