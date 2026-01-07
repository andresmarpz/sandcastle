/**
 * Context object passed to init hooks.
 * Provides access to paths, identifiers, and helper methods.
 */
export interface SandcastleContext {
  // ─── Paths ─────────────────────────────────────────────
  /** Absolute path to the original repository */
  readonly baseRepoPath: string;

  /** Absolute path to the new worktree (also the cwd) */
  readonly worktreePath: string;

  // ─── Identifiers ───────────────────────────────────────
  /** The registered project name */
  readonly projectName: string;

  /** The name of the new worktree */
  readonly worktreeName: string;

  /** The new branch name */
  readonly branch: string;

  /** The ref the worktree was created from */
  readonly baseBranch: string;

  // ─── File Helpers ──────────────────────────────────────
  /**
   * Copy a file from the base repository to the worktree.
   * Paths are relative to their respective roots.
   *
   * @param from - Relative path in the base repository
   * @param to - Relative path in the worktree (defaults to same as `from`)
   *
   * @example
   * await ctx.copyFromBase('.env')
   * await ctx.copyFromBase('.env', '.env.local')
   */
  readonly copyFromBase: (from: string, to?: string) => Promise<void>;

  /**
   * Check if a file exists in the worktree.
   *
   * @param relativePath - Relative path in the worktree
   */
  readonly exists: (relativePath: string) => Promise<boolean>;

  // ─── Execution ─────────────────────────────────────────
  /**
   * Execute a shell command in the worktree directory.
   * Output streams to the terminal in real-time.
   * Throws on non-zero exit code.
   *
   * @param command - The shell command to execute
   * @returns The captured stdout and stderr
   *
   * @example
   * await ctx.exec('bun install')
   * const { stdout } = await ctx.exec('cat package.json')
   */
  readonly exec: (command: string) => Promise<{ stdout: string; stderr: string }>;

  // ─── Logging ───────────────────────────────────────────
  /** Log an informational message */
  readonly log: (message: string) => void;

  /** Log a warning message */
  readonly warn: (message: string) => void;

  /** Log an error message */
  readonly error: (message: string) => void;
}

/**
 * Parameters required to build a SandcastleContext.
 * Passed from the CLI when creating a worktree.
 */
export interface InitParams {
  readonly baseRepoPath: string;
  readonly worktreePath: string;
  readonly projectName: string;
  readonly worktreeName: string;
  readonly branch: string;
  readonly baseBranch: string;
}

/**
 * User-facing config shape.
 * Defined in sandcastle.config.ts at the project root.
 */
export interface SandcastleConfig {
  /**
   * Called when a new worktree is created.
   * Use this to install dependencies, copy files, etc.
   */
  readonly init?: (ctx: SandcastleContext) => Promise<void>;
}

/**
 * Internal logger interface for output.
 */
export interface Logger {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}
