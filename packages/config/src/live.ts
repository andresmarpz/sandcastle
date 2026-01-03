import { Effect, Layer } from "effect"
import * as path from "node:path"
import { ConfigService } from "./service.ts"
import { createSandcastleContext } from "./context.ts"
import type { SandcastleConfig, InitParams, Logger } from "./types.ts"
import {
  ConfigLoadError,
  ConfigValidationError,
  InitHookError,
} from "./errors.ts"

const CONFIG_FILENAMES = ["sandcastle.config.ts", "sandcastle.config.js"]

/**
 * Find the config file path if it exists.
 * Checks for .ts first, then .js.
 */
const findConfigPath = async (
  projectPath: string
): Promise<string | undefined> => {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(projectPath, filename)
    if (await Bun.file(configPath).exists()) {
      return configPath
    }
  }
  return undefined
}

/**
 * Validate that the config object has the expected shape.
 */
const validateConfig = (
  config: unknown,
  configPath: string
): Effect.Effect<SandcastleConfig, ConfigValidationError> =>
  Effect.gen(function* () {
    if (config === null || config === undefined) {
      // Empty/missing default export is valid, just no config
      return {} as SandcastleConfig
    }

    if (typeof config !== "object") {
      return yield* Effect.fail(
        new ConfigValidationError({
          configPath,
          message: `Config must be an object, got ${typeof config}`,
        })
      )
    }

    if ("init" in config && typeof (config as { init: unknown }).init !== "function") {
      return yield* Effect.fail(
        new ConfigValidationError({
          configPath,
          message: `Config 'init' must be a function`,
        })
      )
    }

    return config as SandcastleConfig
  })

const make = ConfigService.of({
  load: (projectPath: string) =>
    Effect.gen(function* () {
      const configPath = yield* Effect.promise(() => findConfigPath(projectPath))

      if (!configPath) {
        return undefined
      }

      // Dynamic import (Bun handles TS natively)
      const module = yield* Effect.tryPromise({
        try: () => import(configPath),
        catch: (error) =>
          new ConfigLoadError({
            configPath,
            cause: error,
            message: `Failed to load config: ${String(error)}`,
          }),
      })

      const config = yield* validateConfig(module.default, configPath)
      return config
    }),

  runInit: (config: SandcastleConfig, params: InitParams) =>
    Effect.gen(function* () {
      if (!config.init) {
        return
      }

      const logs: string[] = []

      const logger: Logger = {
        log: (msg) => console.log(msg),
        warn: (msg) => console.warn(msg),
        error: (msg) => console.error(msg),
      }

      const context = createSandcastleContext(params, logger, (entry) => {
        logs.push(entry)
      })

      yield* Effect.tryPromise({
        try: () => config.init!(context),
        catch: (error) =>
          new InitHookError({
            message: `Init hook failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
            logs,
          }),
      })
    }),

  loadAndRunInit: (projectPath: string, params: InitParams) =>
    Effect.gen(function* () {
      const config = yield* make.load(projectPath)

      if (config) {
        yield* make.runInit(config, params)
      }
    }),
})

export const ConfigServiceLive = Layer.succeed(ConfigService, make)
