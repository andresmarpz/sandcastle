# Agents Setup

Sandcastle uses the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) to spawn Claude Code instances. The SDK launches `claude` as a subprocess, so it must be installed and authenticated on the machine.

## Prerequisites

1. **Claude Code CLI** installed and in your PATH (`claude --version` should work)
2. **Authenticated** via `claude /login` (OAuth) or with an `ANTHROPIC_API_KEY`

## Authentication

The Claude Code subprocess inherits the environment of the Sandcastle server process. Claude Code checks for credentials in this order:

1. `ANTHROPIC_API_KEY` environment variable (if set, takes priority)
2. OAuth credentials in `~/.claude/.credentials.json` (from `claude /login`)

If `ANTHROPIC_API_KEY` is set, Claude Code will use it **instead of** OAuth — even if the key is invalid.

## Running

### Web (development)

```bash
cd /path/to/sandcastle
bun install
bun dev  # starts apps/http + apps/web
```

### Desktop (development)

```bash
cd /path/to/sandcastle
bun install
cd apps/desktop
bun run setup:sidecar  # copies Bun binary + bundles HTTP server
bun run tauri dev
```

## Troubleshooting

### "Invalid API key" / "Claude Code process exited with code 1"

**Cause:** An invalid or expired `ANTHROPIC_API_KEY` is set in the environment. Claude Code prioritizes this over OAuth credentials, so even if `claude /login` works, the API key takes precedence and fails.

**Fix:** Unset the variable in the terminal where you run Sandcastle:

```bash
unset ANTHROPIC_API_KEY
```

Then restart the server. To check if it's set: `echo $ANTHROPIC_API_KEY`

### "Claude Code process exited with code 1" (generic)

Check the server logs for the SDK result message — look for `"is_error": true` and the `result` field which contains the actual error from Claude Code.

### Claude not found in PATH

If running as a desktop app (Tauri), the sidecar process may not inherit your full shell PATH. Make sure `~/.local/bin` (or wherever `claude` is installed) is in your PATH via `~/.bashrc` or `~/.profile`, not just the current session.

### Stale session resume failures

If a Claude Code session fails on first attempt, Sandcastle may save a partial `claudeSessionId`. Subsequent retries will try to `resume` that broken session and keep failing. Fix by creating a new session in the UI.
