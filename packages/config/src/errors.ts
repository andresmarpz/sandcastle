import { Data } from "effect"

/**
 * Error when config file exists but cannot be loaded.
 * This typically means a syntax error or import failure.
 */
export class ConfigLoadError extends Data.TaggedError("ConfigLoadError")<{
  readonly configPath: string
  readonly cause: unknown
  readonly message: string
}> {}

/**
 * Error when config file doesn't match expected shape.
 */
export class ConfigValidationError extends Data.TaggedError(
  "ConfigValidationError"
)<{
  readonly configPath: string
  readonly message: string
}> {}

/**
 * Error when init hook throws during execution.
 * Includes collected logs up to the failure point for debugging.
 */
export class InitHookError extends Data.TaggedError("InitHookError")<{
  readonly message: string
  readonly cause: unknown
  /** Collected stdout/stderr/log entries up to the failure point */
  readonly logs: readonly string[]
}> {}

/**
 * Error when command execution fails (non-zero exit code).
 * Thrown by ctx.exec() when a command fails.
 */
export class CommandExecutionError extends Data.TaggedError(
  "CommandExecutionError"
)<{
  readonly command: string
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}> {}

/**
 * Error when file copy fails.
 * Thrown by ctx.copyFromBase() when the source file doesn't exist
 * or the copy operation fails.
 */
export class FileCopyError extends Data.TaggedError("FileCopyError")<{
  readonly from: string
  readonly to: string
  readonly message: string
}> {}
