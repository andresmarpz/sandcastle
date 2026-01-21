import {
	DatabaseRpcError,
	GitOperationRpcError,
	GitRpc,
	GitSessionNotFoundRpcError,
	NotAGitRepositoryRpcError,
} from "@sandcastle/rpc";
import { StorageService, StorageServiceDefault } from "@sandcastle/storage";
import { Effect, Layer } from "effect";
import {
	type GitOperationError,
	GitService,
	GitServiceLive,
	type NotAGitRepositoryError,
} from "../services/git";

type GitServiceErrors = GitOperationError | NotAGitRepositoryError;

const mapGitServiceError = (
	error: GitServiceErrors,
): GitOperationRpcError | NotAGitRepositoryRpcError => {
	switch (error._tag) {
		case "GitOperationError":
			return new GitOperationRpcError({
				operation: error.operation,
				message: error.message,
				exitCode: error.exitCode,
			});
		case "NotAGitRepositoryError":
			return new NotAGitRepositoryRpcError({
				path: error.path,
			});
	}
};

export const GitRpcHandlers = GitRpc.toLayer(
	Effect.gen(function* () {
		const storage = yield* StorageService;
		const gitService = yield* GitService;

		return GitRpc.of({
			"git.getSessionStats": (params) =>
				Effect.gen(function* () {
					// 1. Look up session
					const session = yield* storage.sessions.get(params.sessionId).pipe(
						Effect.mapError((error) => {
							if (error._tag === "SessionNotFoundError") {
								return new GitSessionNotFoundRpcError({
									sessionId: params.sessionId,
								});
							}
							return new DatabaseRpcError({
								operation: "session.get",
								message: error.message,
							});
						}),
					);

					// 2. Get baseBranch from worktree (or null for main repo sessions)
					let baseBranch: string | null = null;
					if (session.worktreeId) {
						const worktree = yield* storage.worktrees
							.get(session.worktreeId)
							.pipe(
								Effect.map((wt) => wt.baseBranch),
								Effect.catchAll(() => Effect.succeed(null)),
							);
						baseBranch = worktree;
					}

					// 3. Get git stats
					return yield* gitService
						.getDiffStats(session.workingPath, baseBranch)
						.pipe(Effect.mapError(mapGitServiceError));
				}),
		});
	}),
);

export const GitRpcHandlersLive = GitRpcHandlers.pipe(
	Layer.provide(StorageServiceDefault),
	Layer.provide(GitServiceLive),
);
