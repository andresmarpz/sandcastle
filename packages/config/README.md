# @sandcastle/config

Project configuration and initialization hooks for Sandcastle worktrees.

## Installation

This package is used internally by `@sandcastle/cli`. For end users, install via the CLI:

```bash
bun add @sandcastle/config
```

## Usage

Create a `sandcastle.config.ts` (or `.js`) file in your project root:

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

## Config File

| Property | Description |
|----------|-------------|
| File name | `sandcastle.config.ts` or `sandcastle.config.js` |
| Location | Project root (same level as `package.json`) |

## Hooks

### `init`

Runs when a new worktree is created. The working directory is set to the new worktree path.

```typescript
export default defineConfig({
  init: async (ctx) => {
    await ctx.exec('bun install')
  }
})
```

## Context Object

The `init` hook receives a `SandcastleContext` with:

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `baseRepoPath` | `string` | Absolute path to the original repository |
| `worktreePath` | `string` | Absolute path to the new worktree (cwd) |
| `projectName` | `string` | The registered project name |
| `worktreeName` | `string` | The name of the new worktree |
| `branch` | `string` | The new branch name |
| `baseBranch` | `string` | The ref the worktree was created from |

### Methods

#### `exec(command: string): Promise<{ stdout: string; stderr: string }>`

Execute a shell command in the worktree. Output streams in real-time.

```typescript
await ctx.exec('bun install')
await ctx.exec('bun run build')
```

#### `copyFromBase(from: string, to?: string): Promise<void>`

Copy a file from the base repository to the worktree.

```typescript
await ctx.copyFromBase('.env')              // .env -> .env
await ctx.copyFromBase('.env', '.env.local') // .env -> .env.local
```

#### `exists(relativePath: string): Promise<boolean>`

Check if a file exists in the worktree.

```typescript
if (await ctx.exists('prisma/schema.prisma')) {
  await ctx.exec('bun run prisma generate')
}
```

#### `log(message: string): void`

Log an informational message.

#### `warn(message: string): void`

Log a warning message.

#### `error(message: string): void`

Log an error message.

## Error Handling

If the `init` hook throws an error, the worktree creation is rolled back and the full error log is displayed.

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
