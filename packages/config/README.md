# @sandcastle/config

Project configuration and initialization hooks for Sandcastle worktrees.

## Overview

This package provides a configuration system that allows users to define initialization hooks that run automatically when new git worktrees are created via Sandcastle. The primary use case is automating setup tasks like installing dependencies, copying environment files, and running generators.

**Key features:**

- Type-safe configuration via `defineConfig()` helper
- Rich context object with file operations and command execution
- Real-time streaming of command output
- Support for both `.ts` and `.js` config files
- Effect-based service architecture for CLI integration

## User Guide

### Config File Setup

Create a `sandcastle.config.ts` file in your project root (same level as `package.json`):

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    // Install dependencies
    await ctx.exec('bun install')

    // Copy environment files from base repo
    await ctx.copyFromBase('.env')

    ctx.log('Worktree ready!')
  }
})
```

The config file is automatically detected when creating worktrees. Both `.ts` and `.js` extensions are supported (`.ts` is checked first).

### Hooks

#### `init`

Runs when a new worktree is created. The working directory is automatically set to the new worktree path.

```typescript
export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')
  }
})
```

**Behavior:**
- Commands execute in the new worktree directory
- Output streams in real-time to the terminal
- If the hook throws, the worktree creation is rolled back

### Context Object

The `init` hook receives a `SandcastleContext` object with the following properties and methods:

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `baseRepoPath` | `string` | Absolute path to the original repository |
| `worktreePath` | `string` | Absolute path to the new worktree (also the cwd) |
| `projectName` | `string` | The registered project name |
| `worktreeName` | `string` | The name of the new worktree |
| `branch` | `string` | The new branch name |
| `baseBranch` | `string` | The ref the worktree was created from |

#### Methods

##### `exec(command: string): Promise<{ stdout: string; stderr: string }>`

Execute a shell command in the worktree directory. Output streams to the terminal in real-time. Throws on non-zero exit code.

```typescript
await ctx.exec('bun install')
await ctx.exec('bun run build')

// Capture output
const { stdout } = await ctx.exec('cat package.json')
```

##### `copyFromBase(from: string, to?: string): Promise<void>`

Copy a file from the base repository to the worktree. Paths are relative to their respective roots.

```typescript
// Copy .env from base repo to worktree
await ctx.copyFromBase('.env')

// Copy with different destination name
await ctx.copyFromBase('.env', '.env.local')

// Copy nested files (creates directories automatically)
await ctx.copyFromBase('config/secrets.json')
```

##### `exists(relativePath: string): Promise<boolean>`

Check if a file exists in the worktree.

```typescript
if (await ctx.exists('prisma/schema.prisma')) {
  await ctx.exec('bun run prisma generate')
}
```

##### `log(message: string): void`

Log an informational message to the console.

##### `warn(message: string): void`

Log a warning message to the console.

##### `error(message: string): void`

Log an error message to the console.

### Examples

#### Basic Setup

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')
  }
})
```

#### Full-Featured Setup

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    ctx.log(`Setting up worktree "${ctx.worktreeName}"...`)
    ctx.log(`Based on: ${ctx.baseBranch}`)

    // Install dependencies
    await ctx.exec('bun install')

    // Copy environment files
    await ctx.copyFromBase('.env')
    await ctx.copyFromBase('.env.local')

    // Conditional setup based on project structure
    if (await ctx.exists('prisma/schema.prisma')) {
      ctx.log('Generating Prisma client...')
      await ctx.exec('bun run prisma generate')
    }

    if (await ctx.exists('drizzle.config.ts')) {
      ctx.log('Running Drizzle migrations...')
      await ctx.exec('bun run drizzle-kit generate')
    }

    ctx.log('Worktree ready!')
  }
})
```

### Error Handling

If the `init` hook throws an error:

1. The worktree creation is **rolled back** (worktree and branch are deleted)
2. The full error log is displayed to help with debugging
3. The CLI exits with a non-zero status code

---

## Internal Architecture

This section documents how the config package works internally and how it integrates with the CLI.

### Package Structure

```
packages/config/
├── index.ts              # Public exports
├── src/
│   ├── types.ts          # Type definitions
│   ├── errors.ts         # Error classes (Effect TaggedError)
│   ├── service.ts        # ConfigService interface (Effect Context.Tag)
│   ├── context.ts        # SandcastleContext builder
│   ├── live.ts           # ConfigServiceLive implementation
│   ├── define-config.ts  # defineConfig() helper
│   └── config.test.ts    # Test suite
├── package.json
├── tsconfig.json
└── README.md
```

### Service Interface

The package exposes an Effect-based service for use by the CLI:

```typescript
import { ConfigService } from '@sandcastle/config/service'

class ConfigService extends Context.Tag("ConfigService")<ConfigService, {
  /**
   * Load config file from a project root path.
   * Returns undefined if no config file exists.
   */
  load: (projectPath: string) => Effect.Effect<
    SandcastleConfig | undefined,
    ConfigLoadError | ConfigValidationError
  >

  /**
   * Execute the init hook with the provided context.
   * No-op if config has no init hook.
   */
  runInit: (
    config: SandcastleConfig,
    params: InitParams
  ) => Effect.Effect<void, InitHookError>

  /**
   * Convenience method: load config and run init if present.
   */
  loadAndRunInit: (
    projectPath: string,
    params: InitParams
  ) => Effect.Effect<
    void,
    ConfigLoadError | ConfigValidationError | InitHookError
  >
}>() {}
```

### Types

```typescript
// Parameters passed from CLI to build the context
interface InitParams {
  baseRepoPath: string   // Path to original repository
  worktreePath: string   // Path to new worktree
  projectName: string    // Registered project name
  worktreeName: string   // Worktree name
  branch: string         // New branch name
  baseBranch: string     // Base ref (e.g., "main")
}

// User-facing config shape
interface SandcastleConfig {
  init?: (ctx: SandcastleContext) => Promise<void>
}
```

### Error Types

```typescript
// Config file exists but can't be loaded (syntax error, import failure)
class ConfigLoadError extends Data.TaggedError("ConfigLoadError")<{
  configPath: string
  cause: unknown
  message: string
}>

// Config doesn't match expected shape
class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  configPath: string
  message: string
}>

// Init hook threw during execution
class InitHookError extends Data.TaggedError("InitHookError")<{
  message: string
  cause: unknown
  logs: readonly string[]  // Collected logs up to failure
}>

// Command execution failed (non-zero exit)
class CommandExecutionError extends Data.TaggedError("CommandExecutionError")<{
  command: string
  exitCode: number
  stdout: string
  stderr: string
}>

// File copy failed
class FileCopyError extends Data.TaggedError("FileCopyError")<{
  from: string
  to: string
  message: string
}>
```

### CLI Integration

To integrate with `@sandcastle/cli`, add the config service to the layer composition and call it after worktree creation:

```typescript
// In @sandcastle/cli

import { ConfigService, ConfigServiceLive } from '@sandcastle/config'
import type { InitParams } from '@sandcastle/config'

// 1. Add to layer composition
const MainLayer = Layer.mergeAll(
  NodeContext.layer,
  WorktreeServiceLive,
  ProjectServiceLive,
  ConfigServiceLive  // Add this
)

// 2. In worktree create command, after worktree is created:
const worktreeCreate = Effect.gen(function* () {
  const worktreeService = yield* WorktreeService
  const configService = yield* ConfigService
  const projects = yield* ProjectService

  // ... get project, create worktree ...

  const result = yield* worktreeService.create({
    repoPath: project.gitPath,
    worktreePath,
    branch: name,
    createBranch: true,
    fromRef,
  })

  // Run init hook after worktree creation
  const initParams: InitParams = {
    baseRepoPath: project.gitPath,
    worktreePath,
    projectName: project.name,
    worktreeName: name,
    branch: name,
    baseBranch: fromRef,
  }

  yield* configService.loadAndRunInit(project.gitPath, initParams).pipe(
    Effect.catchTag("InitHookError", (err) =>
      Effect.gen(function* () {
        // Log error details
        yield* Console.error(`Init hook failed: ${err.message}`)
        for (const log of err.logs) {
          yield* Console.log(log)
        }

        // Rollback worktree
        yield* worktreeService.remove({
          repoPath: project.gitPath,
          worktreePath,
          force: true,
        })

        return yield* Effect.fail(err)
      })
    )
  )

  return result
})
```

### Config Loading Process

1. **Find config file**: Check for `sandcastle.config.ts`, then `sandcastle.config.js` in the project root
2. **Dynamic import**: Use Bun's native TypeScript import to load the config
3. **Validate shape**: Ensure the default export is an object with optional `init` function
4. **Build context**: Create `SandcastleContext` with all helpers bound to the correct paths
5. **Execute hook**: Run the `init` function if present, collecting logs for error reporting

### Exports

```typescript
// Main entry point (index.ts)
export * from "./src/errors.ts"          // All error classes
export * from "./src/types.ts"           // All type definitions
export { ConfigService } from "./src/service.ts"
export { ConfigServiceLive } from "./src/live.ts"
export { defineConfig } from "./src/define-config.ts"

// Subpath exports (package.json)
"exports": {
  ".": "./index.ts",
  "./errors": "./src/errors.ts",
  "./types": "./src/types.ts",
  "./service": "./src/service.ts",
  "./live": "./src/live.ts"
}
```

---

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
