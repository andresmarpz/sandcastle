import { Effect, Layer, Ref, Logger, LogLevel } from "effect"
import { NodeContext } from "@effect/platform-node"
import { makeProjectServiceTest, type ProjectServiceTestConfig } from "../services/project-test.ts"
import { makeWorktreeServiceTest, type WorktreeServiceTestConfig } from "./worktree-test.ts"
import { makeConfigServiceTest, type ConfigServiceTestConfig } from "./config-test.ts"
import type { Project } from "../services/project.ts"

export { makeProjectServiceTest, ProjectServiceTest } from "../services/project-test.ts"
export { makeWorktreeServiceTest, WorktreeServiceTest } from "./worktree-test.ts"
export { makeConfigServiceTest, ConfigServiceTest } from "./config-test.ts"
export type { ConfigServiceTestConfig } from "./config-test.ts"

export interface TestConfig {
  project?: ProjectServiceTestConfig
  worktree?: WorktreeServiceTestConfig
  config?: ConfigServiceTestConfig
}

/**
 * Creates a combined test layer with all services.
 */
export const makeTestLayer = (config: TestConfig = {}) =>
  Layer.mergeAll(
    NodeContext.layer,
    makeProjectServiceTest(config.project),
    makeWorktreeServiceTest(config.worktree),
    makeConfigServiceTest(config.config)
  )

/**
 * Creates a test layer with a capturing logger.
 * Returns a tuple of [layer, getLogsFn].
 */
export const makeTestLayerWithCapture = (config: TestConfig = {}) => {
  const logs: string[] = []

  const captureLogger = Logger.make(({ message }) => {
    logs.push(String(message))
  })

  const loggerLayer = Logger.replace(Logger.defaultLogger, captureLogger)

  return {
    layer: Layer.mergeAll(
      NodeContext.layer,
      makeProjectServiceTest(config.project),
      makeWorktreeServiceTest(config.worktree),
      makeConfigServiceTest(config.config),
      loggerLayer
    ),
    getLogs: () => [...logs],
    clearLogs: () => { logs.length = 0 },
  }
}

/**
 * Runs a command effect with test layers and captures log output.
 * Returns the captured logs.
 */
export const runTestCommand = async <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  config: TestConfig = {}
): Promise<string[]> => {
  const { layer, getLogs } = makeTestLayerWithCapture(config)

  await Effect.runPromise(
    Effect.provide(effect, layer) as Effect.Effect<A, E, never>
  )
  return getLogs()
}

/**
 * Runs a command effect with test layers and expects it to fail.
 * Returns the error.
 */
export const runTestCommandExpectError = async <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  config: TestConfig = {}
): Promise<E> => {
  const layer = makeTestLayer(config)
  const flipped = Effect.flip(Effect.provide(effect, layer) as Effect.Effect<A, E, never>)
  return Effect.runPromise(flipped)
}

/**
 * Creates a mock project for testing.
 */
export const mockProject = (overrides: Partial<Project> = {}): Project => ({
  id: crypto.randomUUID(),
  name: "test-project",
  gitPath: "/path/to/repo",
  createdAt: Date.now(),
  ...overrides,
})
