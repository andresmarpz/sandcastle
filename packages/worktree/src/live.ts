import { Effect, Layer } from "effect";

import {
	BranchExistsError,
	GitCommandError,
	WorktreeExistsError,
	WorktreeNotFoundError,
} from "./errors";
import { WorktreeService } from "./service";
import type {
	CreateWorktreeOptions,
	RemoveWorktreeOptions,
	WorktreeInfo,
} from "./types";

const parseWorktreeList = (output: string): WorktreeInfo[] => {
	const worktrees: WorktreeInfo[] = [];
	const blocks = output.trim().split("\n\n");

	for (const block of blocks) {
		if (!block.trim()) continue;

		const lines = block.split("\n");
		let path = "";
		let commit = "";
		let branch = "";
		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				path = line.slice(9);
			} else if (line.startsWith("HEAD ")) {
				commit = line.slice(5);
			} else if (line.startsWith("branch ")) {
				branch = line.slice(7).replace("refs/heads/", "");
			} else if (line === "bare") {
				continue;
			}
		}

		if (path) {
			worktrees.push({
				path,
				branch: branch || "HEAD",
				commit,
				isMain: worktrees.length === 0,
			});
		}
	}

	return worktrees;
};

const runGitCommand = (
	repoPath: string,
	args: string[],
): Effect.Effect<string, GitCommandError> =>
	Effect.tryPromise({
		try: async () => {
			const result = await Bun.$`git -C ${repoPath} ${args}`.quiet();
			return result.text();
		},
		catch: (error) => {
			const shellError = error as {
				exitCode?: number;
				stderr?: { toString(): string };
			};
			return new GitCommandError({
				command: `git -C ${repoPath} ${args.join(" ")}`,
				stderr: shellError.stderr?.toString() ?? String(error),
				exitCode: shellError.exitCode ?? 1,
			});
		},
	});

const make = WorktreeService.of({
	create: (options: CreateWorktreeOptions) =>
		Effect.gen(function* () {
			const args: string[] = ["worktree", "add"];

			if (options.createBranch) {
				args.push("-b", options.branch);
				args.push(options.worktreePath);
				if (options.fromRef) {
					args.push(options.fromRef);
				}
			} else {
				args.push(options.worktreePath, options.branch);
			}

			yield* runGitCommand(options.repoPath, args).pipe(
				Effect.mapError((err) => {
					if (err.stderr.includes("already exists")) {
						return new WorktreeExistsError({ path: options.worktreePath });
					}
					if (
						err.stderr.includes("already checked out") ||
						err.stderr.includes("is already checked out")
					) {
						return new BranchExistsError({ branch: options.branch });
					}
					if (
						err.stderr.includes("fatal: a]branch named") &&
						err.stderr.includes("already exists")
					) {
						return new BranchExistsError({ branch: options.branch });
					}
					return err;
				}),
			);

			const worktrees = yield* Effect.succeed(options.repoPath).pipe(
				Effect.flatMap((path) =>
					runGitCommand(path, ["worktree", "list", "--porcelain"]),
				),
				Effect.map(parseWorktreeList),
			);

			const created = worktrees.find((w) => w.path === options.worktreePath);
			if (!created) {
				return yield* Effect.fail(
					new GitCommandError({
						command: "worktree list",
						stderr: "Created worktree not found in list",
						exitCode: 1,
					}),
				);
			}

			return created;
		}),

	list: (repoPath: string) =>
		runGitCommand(repoPath, ["worktree", "list", "--porcelain"]).pipe(
			Effect.map(parseWorktreeList),
		),

	remove: (options: RemoveWorktreeOptions) =>
		Effect.gen(function* () {
			const args = ["worktree", "remove"];
			if (options.force) {
				args.push("--force");
			}
			args.push(options.worktreePath);

			yield* runGitCommand(options.repoPath, args).pipe(
				Effect.mapError((err) => {
					if (err.stderr.includes("is not a working tree")) {
						return new WorktreeNotFoundError({ path: options.worktreePath });
					}
					return err;
				}),
			);
		}),

	get: (repoPath: string, worktreePath: string) =>
		Effect.gen(function* () {
			const worktrees = yield* runGitCommand(repoPath, [
				"worktree",
				"list",
				"--porcelain",
			]).pipe(Effect.map(parseWorktreeList));

			const worktree = worktrees.find((w) => w.path === worktreePath);
			if (!worktree) {
				return yield* Effect.fail(
					new WorktreeNotFoundError({ path: worktreePath }),
				);
			}

			return worktree;
		}),

	prune: (repoPath: string) =>
		runGitCommand(repoPath, ["worktree", "prune"]).pipe(Effect.asVoid),
});

export const WorktreeServiceLive = Layer.succeed(WorktreeService, make);
