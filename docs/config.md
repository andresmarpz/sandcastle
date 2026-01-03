# Sandcastle Configuration

Sandcastle supports project-level configuration through a `sandcastle.config.ts` file at your project root. This allows you to define initialization hooks that run automatically when new worktrees are created.

## Quick Start

```typescript
// sandcastle.config.ts
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')
    await ctx.copyFromBase('.env')
  }
})
```

## Configuration File

| Property | Location |
|----------|----------|
| File name | `sandcastle.config.ts` |
| Location | Project root (same level as `package.json`) |
| Package | `@sandcastle/config` |

## Hooks

### `init`

Runs when a new worktree is created. The working directory is set to the new worktree path.

```typescript
export default defineConfig({
  init: async (ctx) => {
    // This runs inside the new worktree
    await ctx.exec('bun install')
  }
})
```

**Behavior:**
- Commands execute in the new worktree directory
- Output streams in real-time to the terminal
- If the hook throws an error, the worktree creation is rolled back and the full error log is displayed

## Context Object

The `init` hook receives a `SandcastleContext` object with the following properties and helpers:

### Paths

| Property | Type | Description |
|----------|------|-------------|
| `baseRepoPath` | `string` | Absolute path to the original repository |
| `worktreePath` | `string` | Absolute path to the new worktree (also the cwd) |

### Identifiers

| Property | Type | Description |
|----------|------|-------------|
| `projectName` | `string` | The registered project name |
| `worktreeName` | `string` | The name of the new worktree |
| `branch` | `string` | The new branch name |
| `baseBranch` | `string` | The ref the worktree was created from |

### File Helpers

#### `copyFromBase(from: string, to?: string): Promise<void>`

Copy a file from the base repository to the worktree. Paths are relative to their respective roots.

```typescript
// Copy .env from base repo to worktree
await ctx.copyFromBase('.env')

// Copy with a different destination name
await ctx.copyFromBase('.env', '.env.local')

// Copy nested files
await ctx.copyFromBase('config/secrets.json', 'config/secrets.json')
```

#### `exists(relativePath: string): Promise<boolean>`

Check if a file exists in the worktree.

```typescript
if (await ctx.exists('prisma/schema.prisma')) {
  await ctx.exec('bun run prisma generate')
}
```

### Execution

#### `exec(command: string): Promise<{ stdout: string; stderr: string }>`

Execute a shell command in the worktree directory. Output streams to the terminal in real-time. Throws on non-zero exit code.

```typescript
await ctx.exec('bun install')
await ctx.exec('bun run db:migrate')

// Capture output
const { stdout } = await ctx.exec('cat package.json')
```

### Logging

#### `log(message: string): void`

Log an informational message.

```typescript
ctx.log('Installing dependencies...')
```

#### `warn(message: string): void`

Log a warning message.

```typescript
ctx.warn('No .env file found in base repo, skipping copy')
```

#### `error(message: string): void`

Log an error message (does not throw).

```typescript
ctx.error('Failed to copy .env file')
```

## Examples

### Basic Setup

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')
  }
})
```

### Copy Environment Files

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')

    // Copy environment files if they exist in base repo
    await ctx.copyFromBase('.env')
    await ctx.copyFromBase('.env.local')
  }
})
```

### Conditional Setup

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    ctx.log(`Setting up worktree "${ctx.worktreeName}"...`)

    await ctx.exec('bun install')

    // Prisma
    if (await ctx.exists('prisma/schema.prisma')) {
      ctx.log('Generating Prisma client...')
      await ctx.exec('bun run prisma generate')
    }

    // Copy env files
    await ctx.copyFromBase('.env')

    ctx.log('Done!')
  }
})
```

### Using Base Repo Path

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')

    // Use baseRepoPath for custom operations
    ctx.log(`Base repo: ${ctx.baseRepoPath}`)
    ctx.log(`Worktree: ${ctx.worktreePath}`)
    ctx.log(`Created from branch: ${ctx.baseBranch}`)
  }
})
```

## Error Handling

If the `init` hook throws an error:

1. The worktree creation is **rolled back** (worktree and branch are deleted)
2. The full error log is displayed to help with debugging
3. The CLI exits with a non-zero status code

```typescript
import { defineConfig } from '@sandcastle/config'

export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')

    // If this fails, the entire worktree creation is rolled back
    await ctx.exec('bun run build')
  }
})
```

## Package Structure

The configuration system is provided by the `@sandcastle/config` package:

```
packages/config/
├── src/
│   ├── index.ts        # Public exports (defineConfig, types)
│   ├── types.ts        # SandcastleContext, SandcastleConfig
│   ├── loader.ts       # Config file loading
│   └── executor.ts     # Hook execution with context
└── package.json
```

This package is used internally by `@sandcastle/cli` to load and execute configuration hooks during worktree operations.
