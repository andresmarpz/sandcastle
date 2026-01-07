import * as React from "react";
import { Effect } from "effect";
import { RpcClient } from "@effect/rpc";
import type {
  WorktreeInfo,
  CreateWorktreeOptions,
  RemoveWorktreeOptions,
} from "@sandcastle/rpc";
import { WorktreeRpc } from "@sandcastle/rpc";
import { ProtocolLive } from "./client";
import { useRepo } from "@/context/repo-context";

export type { WorktreeInfo, CreateWorktreeOptions, RemoveWorktreeOptions };

// Run an RPC effect with proper scoping
function runRpc<A, E>(
  effect: Effect.Effect<A, E, RpcClient.Protocol>,
): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(ProtocolLive)));
}

// Query state type
type QueryState<T, E> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: E };

export function useWorktrees() {
  const { repoPath } = useRepo();
  const [state, setState] = React.useState<
    QueryState<readonly WorktreeInfo[], unknown>
  >({
    status: "idle",
  });

  const execute = React.useCallback(() => {
    if (!repoPath) {
      setState({ status: "success", data: [] });
      return;
    }

    setState({ status: "loading" });

    const program = Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(WorktreeRpc);
        return yield* client.worktree.list({ repoPath });
      }),
    );

    runRpc(program)
      .then((data) => setState({ status: "success", data }))
      .catch((error) => setState({ status: "error", error }));
  }, [repoPath]);

  React.useEffect(() => {
    execute();
  }, [execute]);

  return {
    data: state.status === "success" ? state.data : undefined,
    error: state.status === "error" ? state.error : undefined,
    isLoading: state.status === "loading",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    refetch: execute,
  };
}

export function useWorktree(worktreePath: string | null) {
  const { repoPath } = useRepo();
  const [state, setState] = React.useState<QueryState<WorktreeInfo, unknown>>({
    status: "idle",
  });

  const execute = React.useCallback(() => {
    if (!repoPath || !worktreePath) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });

    const program = Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(WorktreeRpc);
        return yield* client.worktree.get({ repoPath, worktreePath });
      }),
    );

    runRpc(program)
      .then((data) => setState({ status: "success", data }))
      .catch((error) => setState({ status: "error", error }));
  }, [repoPath, worktreePath]);

  React.useEffect(() => {
    execute();
  }, [execute]);

  return {
    data: state.status === "success" ? state.data : undefined,
    error: state.status === "error" ? state.error : undefined,
    isLoading: state.status === "loading",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    refetch: execute,
  };
}

export function useCreateWorktree() {
  const [state, setState] = React.useState<QueryState<WorktreeInfo, unknown>>({
    status: "idle",
  });

  const mutate = React.useCallback(async (options: CreateWorktreeOptions) => {
    setState({ status: "loading" });

    const program = Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(WorktreeRpc);
        return yield* client.worktree.create(options);
      }),
    );

    try {
      const data = await runRpc(program);
      setState({ status: "success", data });
      return data;
    } catch (error) {
      setState({ status: "error", error });
      throw error;
    }
  }, []);

  return {
    mutate,
    isLoading: state.status === "loading",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    error: state.status === "error" ? state.error : undefined,
    reset: () => setState({ status: "idle" }),
  };
}

export function useRemoveWorktree() {
  const [state, setState] = React.useState<QueryState<void, unknown>>({
    status: "idle",
  });

  const mutate = React.useCallback(async (options: RemoveWorktreeOptions) => {
    setState({ status: "loading" });

    const program = Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(WorktreeRpc);
        return yield* client.worktree.remove(options);
      }),
    );

    try {
      await runRpc(program);
      setState({ status: "success", data: undefined });
    } catch (error) {
      setState({ status: "error", error });
      throw error;
    }
  }, []);

  return {
    mutate,
    isLoading: state.status === "loading",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    error: state.status === "error" ? state.error : undefined,
    reset: () => setState({ status: "idle" }),
  };
}

export function usePruneWorktrees() {
  const { repoPath } = useRepo();
  const [state, setState] = React.useState<QueryState<void, unknown>>({
    status: "idle",
  });

  const mutate = React.useCallback(async () => {
    if (!repoPath) {
      throw new Error("No repo selected");
    }

    setState({ status: "loading" });

    const program = Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(WorktreeRpc);
        return yield* client.worktree.prune({ repoPath });
      }),
    );

    try {
      await runRpc(program);
      setState({ status: "success", data: undefined });
    } catch (error) {
      setState({ status: "error", error });
      throw error;
    }
  }, [repoPath]);

  return {
    mutate,
    isLoading: state.status === "loading",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    error: state.status === "error" ? state.error : undefined,
    reset: () => setState({ status: "idle" }),
  };
}
