import { Effect, Layer } from "effect"
import {
  ConfigService,
  InitHookError,
  type SandcastleConfig,
  type InitParams,
} from "@sandcastle/config"

export interface ConfigServiceTestConfig {
  /** Mock config to return for load. undefined means no config file exists. */
  mockConfig?: SandcastleConfig
  /** Should init hook fail? */
  initShouldFail?: boolean
  /** Error message if init fails */
  initErrorMessage?: string
}

/**
 * Creates a test layer for ConfigService with mock behavior.
 */
export const makeConfigServiceTest = (config: ConfigServiceTestConfig = {}) => {
  const { mockConfig, initShouldFail = false, initErrorMessage = "Mock init failure" } = config

  return Layer.succeed(
    ConfigService,
    ConfigService.of({
      load: (_projectPath: string) => Effect.succeed(mockConfig),

      runInit: (_config: SandcastleConfig, _params: InitParams) =>
        initShouldFail
          ? Effect.fail(
              new InitHookError({
                message: initErrorMessage,
                cause: new Error(initErrorMessage),
                logs: [],
              })
            )
          : Effect.void,

      loadAndRunInit: (_projectPath: string, _params: InitParams) =>
        Effect.gen(function* () {
          // If no config exists, just succeed (no-op)
          if (!mockConfig) return

          // If init should fail, fail with InitHookError
          if (initShouldFail) {
            return yield* Effect.fail(
              new InitHookError({
                message: initErrorMessage,
                cause: new Error(initErrorMessage),
                logs: [],
              })
            )
          }

          // Otherwise succeed (init hook ran successfully)
        }),
    })
  )
}

/**
 * Default test layer with no config file
 */
export const ConfigServiceTest = makeConfigServiceTest()
