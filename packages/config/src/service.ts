import { Context, type Effect } from "effect";

import type { ConfigLoadError, ConfigValidationError, InitHookError } from "./errors.ts";
import type { InitParams, SandcastleConfig } from "./types.ts";

/**
 * Service for loading and executing Sandcastle configuration.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const config = yield* ConfigService
 *   yield* config.loadAndRunInit(projectPath, params)
 * })
 * ```
 */
export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  {
    /**
     * Load config file from a project root path.
     * Checks for sandcastle.config.ts first, then .js.
     *
     * @param projectPath - Absolute path to the project root
     * @returns The loaded config, or undefined if no config file exists
     */
    readonly load: (
      projectPath: string
    ) => Effect.Effect<SandcastleConfig | undefined, ConfigLoadError | ConfigValidationError>;

    /**
     * Execute the init hook with the provided context.
     * No-op if config has no init hook.
     *
     * @param config - The loaded config object
     * @param params - Parameters for building the context
     */
    readonly runInit: (
      config: SandcastleConfig,
      params: InitParams
    ) => Effect.Effect<void, InitHookError>;

    /**
     * Convenience method: load config and run init hook if present.
     * Combines load + runInit into a single operation.
     *
     * @param projectPath - Absolute path to the project root
     * @param params - Parameters for building the context
     */
    readonly loadAndRunInit: (
      projectPath: string,
      params: InitParams
    ) => Effect.Effect<void, ConfigLoadError | ConfigValidationError | InitHookError>;
  }
>() {}
