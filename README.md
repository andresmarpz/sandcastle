# Sandcastle

An open source agent orchestrator for managing ephemeral AI coding instances.

## What is Sandcastle?

Sandcastle lets you spawn, manage, and monitor multiple AI coding agents (like Claude Code) running in isolated environments. Each agent works in its own sandboxed container with a dedicated git worktree, completes a task, opens a PR, and then disappears.

## Why?

- **Parallel work**: Run 3-4 agents simultaneously on different tickets
- **Isolation**: Each agent gets its own container and git worktree
- **Ephemeral**: Spin up for a task, tear down when done
- **Simple**: Automates the tedious setup of worktrees and environments

## Status

Early development.

## License

MIT
