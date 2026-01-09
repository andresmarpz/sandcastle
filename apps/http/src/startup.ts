import { Effect, Layer } from "effect";

import { StorageServiceDefault } from "@sandcastle/storage";
import { WorktreeServiceLive } from "@sandcastle/worktree";

import { syncWorktrees } from "./handlers";

/**
 * Background startup task that syncs worktrees.
 * This runs after the server starts without blocking request handling.
 */
const startupSync = Effect.gen(function* () {
  yield* Effect.fork(
    syncWorktrees.pipe(
      Effect.tap(result =>
        Effect.log(`Worktree sync complete: ${result.removedIds.length} orphaned records removed`)
      ),
      Effect.catchAll(error => Effect.logWarning(`Worktree sync failed: ${error._tag}`))
    )
  );
});

/**
 * Startup tasks layer.
 * Runs background tasks when the server starts without blocking.
 */
export const StartupTasksLive = Layer.scopedDiscard(startupSync).pipe(
  Layer.provide(StorageServiceDefault),
  Layer.provide(WorktreeServiceLive)
);
