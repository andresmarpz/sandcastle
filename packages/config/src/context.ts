import * as path from "node:path";

import { CommandExecutionError, FileCopyError } from "./errors.ts";
import type { InitParams, Logger, SandcastleContext } from "./types.ts";

/**
 * Create a SandcastleContext for use in init hooks.
 *
 * @param params - The init parameters (paths, identifiers)
 * @param logger - Logger for output
 * @param onLog - Optional callback to collect log entries
 */
export const createSandcastleContext = (
  params: InitParams,
  logger: Logger,
  onLog?: (entry: string) => void
): SandcastleContext => {
  const collectLog = (prefix: string, message: string) => {
    const entry = `[${prefix}] ${message}`;
    onLog?.(entry);
  };

  return {
    // Paths
    baseRepoPath: params.baseRepoPath,
    worktreePath: params.worktreePath,

    // Identifiers
    projectName: params.projectName,
    worktreeName: params.worktreeName,
    branch: params.branch,
    baseBranch: params.baseBranch,

    // File helpers
    copyFromBase: async (from: string, to?: string): Promise<void> => {
      const sourcePath = path.join(params.baseRepoPath, from);
      const destPath = path.join(params.worktreePath, to ?? from);

      // Check if source exists
      const sourceFile = Bun.file(sourcePath);
      if (!(await sourceFile.exists())) {
        throw new FileCopyError({
          from: sourcePath,
          to: destPath,
          message: `Source file does not exist: ${sourcePath}`
        });
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destPath);
      await Bun.$`mkdir -p ${destDir}`.quiet();

      // Copy file
      await Bun.write(destPath, sourceFile);
    },

    exists: async (relativePath: string): Promise<boolean> => {
      const fullPath = path.join(params.worktreePath, relativePath);
      return await Bun.file(fullPath).exists();
    },

    // Execution with real-time streaming
    exec: async (command: string): Promise<{ stdout: string; stderr: string }> => {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: params.worktreePath,
        stdout: "pipe",
        stderr: "pipe"
      });

      let stdout = "";
      let stderr = "";

      // Stream stdout and stderr
      const readStream = async (stream: ReadableStream<Uint8Array>, isStderr: boolean) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            const text = decoder.decode(result.value);
            if (isStderr) {
              stderr += text;
              process.stderr.write(text);
            } else {
              stdout += text;
              process.stdout.write(text);
            }
            collectLog(isStderr ? "stderr" : "stdout", text.trimEnd());
          }
        } finally {
          reader.releaseLock();
        }
      };

      await Promise.all([readStream(proc.stdout, false), readStream(proc.stderr, true)]);

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        throw new CommandExecutionError({
          command,
          exitCode,
          stdout,
          stderr
        });
      }

      return { stdout, stderr };
    },

    // Logging
    log: (message: string): void => {
      logger.log(message);
      collectLog("log", message);
    },
    warn: (message: string): void => {
      logger.warn(message);
      collectLog("warn", message);
    },
    error: (message: string): void => {
      logger.error(message);
      collectLog("error", message);
    }
  };
};
