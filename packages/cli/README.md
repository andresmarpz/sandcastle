# Sandcastle CLI

Command-line interface for managing git worktrees and coding agents.

## Installation

From the monorepo root:

```bash
bun install
```

## Usage

```bash
# Run directly
bun run packages/cli/index.ts <command>

# Or from the cli package
cd packages/cli
bun run index.ts <command>
```

## Quick Start

```bash
# 1. Register a project
bun run index.ts project add --name my-app ~/code/my-app

# 2. Create a worktree for a feature
bun run index.ts worktree create my-app feature-auth

# 3. List worktrees
bun run index.ts worktree list my-app

# 4. Clean up when done
bun run index.ts worktree delete my-app feature-auth
```

## Commands

### Project Management

Register and manage projects. Projects map a short name to a git repository path, so you don't have to type full paths every time.

Project data is stored in a SQLite database at `~/sandcastle/sandcastle.db`.

#### `project add`

Register a project with Sandcastle.

```bash
sandcastle project add [--name <name>] <path>
```

**Arguments:**

- `<path>` - Path to the git repository

**Options:**

- `--name <name>` - Custom project name (defaults to directory name)

**Example:**

```bash
# Register with directory name as project name
bun run index.ts project add ~/code/my-app

# Register with custom name
bun run index.ts project add --name app ~/code/my-app
```

---

#### `project list`

List all registered projects.

```bash
sandcastle project list
```

**Output:**

```
Registered projects:

my-app
  Path: /Users/you/code/my-app
another-project
  Path: /Users/you/code/another-project
```

---

#### `project remove`

Unregister a project (does not delete the repository).

```bash
sandcastle project remove <name>
```

**Arguments:**

- `<name>` - Project name to remove

**Example:**

```bash
bun run index.ts project remove my-app
```

---

### Worktree Management

Manage git worktrees for isolated development environments. All worktree commands use **project names** (registered via `project add`) instead of full paths.

#### `worktree create`

Create a new worktree with a new branch.

```bash
sandcastle worktree create [--from <ref>] <project> <name>
```

**Arguments:**

- `<project>` - Project name (registered with `project add`)
- `<name>` - Name for the worktree and branch

**Options:**

- `--from <ref>` - Branch or ref to base the worktree from (defaults to HEAD)

**Example:**

```bash
# Create worktree from current HEAD
bun run index.ts worktree create my-app feature-auth

# Create worktree from main branch
bun run index.ts worktree create --from main my-app feature-auth
```

---

#### `worktree list`

List all worktrees for a project.

```bash
sandcastle worktree list <project>
```

**Arguments:**

- `<project>` - Project name

**Example:**

```bash
bun run index.ts worktree list my-app
```

**Output:**

```
Worktrees for 'my-app':

main (main)
  Path: /Users/you/code/my-app
  Commit: abc1234...
feature-auth
  Path: /Users/you/sandcastle/worktrees/my-app/feature-auth
  Commit: def5678...
```

---

#### `worktree delete`

Delete a worktree.

```bash
sandcastle worktree delete [--force] <project> <name>
```

**Arguments:**

- `<project>` - Project name
- `<name>` - Name of the worktree to delete

**Options:**

- `-f, --force` - Force removal even if worktree has uncommitted changes

**Example:**

```bash
# Normal delete
bun run index.ts worktree delete my-app feature-auth

# Force delete dirty worktree
bun run index.ts worktree delete -f my-app feature-auth
```

---

#### `worktree open`

Open a worktree in VS Code.

```bash
sandcastle worktree open <project> <name>
```

**Arguments:**

- `<project>` - Project name
- `<name>` - Name of the worktree to open

**Example:**

```bash
bun run index.ts worktree open my-app feature-auth
```

---

#### `worktree prune`

Clean up stale worktree references (worktrees that were manually deleted).

```bash
sandcastle worktree prune <project>
```

**Arguments:**

- `<project>` - Project name

**Example:**

```bash
bun run index.ts worktree prune my-app
```

---

## How It Works

### Data Storage

Sandcastle stores all data in `~/sandcastle/`:

```
~/sandcastle/
├── sandcastle.db              # SQLite database (project registry)
└── worktrees/
    └── {project-name}/
        └── {worktree-name}/   # Git worktree directories
```

### SQLite Database

The project registry uses SQLite (via Bun's built-in `bun:sqlite`) to store project mappings:

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  git_path TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

This allows you to:
- Reference projects by short names instead of full paths
- Persist project registrations across sessions
- Query and manage projects programmatically

### Worktree Path Convention

When you create a worktree, it's placed at:

```
~/sandcastle/worktrees/{project-name}/{worktree-name}
```

For example:
- Project: `my-app` (pointing to `/Users/you/code/my-app`)
- Worktree name: `feature-auth`
- Worktree path: `~/sandcastle/worktrees/my-app/feature-auth`

### Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   CLI       │────▶│ ProjectService   │────▶│   SQLite    │
│ (@effect/cli)     │ (Effect Service) │     │ (bun:sqlite)│
└─────────────┘     └──────────────────┘     └─────────────┘
       │
       │            ┌──────────────────┐     ┌─────────────┐
       └───────────▶│ WorktreeService  │────▶│   Git CLI   │
                    │ (Effect Service) │     │  (Bun.$)    │
                    └──────────────────┘     └─────────────┘
```

The CLI uses:

- **@effect/cli** - Type-safe command-line argument parsing
- **Effect** - Functional effect system for error handling and dependency injection
- **ProjectService** - SQLite-backed project registry
- **WorktreeService** - Git worktree operations (from `worktree` package)

## Development

```bash
# Type check
bun run typecheck

# Run CLI
bun run dev -- <command>

# Example
bun run dev -- project list
bun run dev -- worktree list my-app
```

## Troubleshooting

### "Project not found" error

Make sure you've registered the project first:

```bash
bun run index.ts project add --name my-app ~/code/my-app
```

### "Invalid git repository" error

The path must point to a valid git repository (contains a `.git` directory).

### Options must come before arguments

In @effect/cli, options must be specified before positional arguments:

```bash
# Correct
bun run index.ts project add --name my-app ~/code/my-app

# Incorrect (will error)
bun run index.ts project add ~/code/my-app --name my-app
```
