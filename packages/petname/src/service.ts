import { Context, Effect } from "effect"
import type { GenerateOptions, Petname } from "./types.ts"
import type { InvalidWordCountError } from "./errors.ts"

/**
 * Service for generating random petnames.
 *
 * Petnames are memorable, human-friendly identifiers like "brave-sunset"
 * or "calm-river". They're commonly used for:
 * - Git worktree names
 * - Container names (like Docker's "angry_darwin")
 * - Temporary resource identifiers
 */
export class PetnameService extends Context.Tag("PetnameService")<
  PetnameService,
  {
    /**
     * Generate a petname with the given options.
     * @param options - Configuration for the generated name
     * @returns Effect that produces a Petname or fails with InvalidWordCountError
     */
    readonly generate: (
      options?: GenerateOptions
    ) => Effect.Effect<Petname, InvalidWordCountError>
  }
>() {}
