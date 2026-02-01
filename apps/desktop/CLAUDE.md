# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Sandcastle Desktop is a Tauri app (Rust + React 19) that serves as the desktop client for the Sandcastle agent orchestrator. It manages fleets of AI coding agents (Claude Code instances) across isolated development environments.

## Commands

```bash
bun run dev              # Vite dev server on port 1420
bun run dev:tauri        # Full Tauri dev (Windows .bat script)
bun run tauri dev        # Full Tauri dev (cross-platform)
bun run typecheck        # TypeScript checking via tsgo
bun run biome            # Format + lint (auto-fix)
bun run biome:check      # Lint check only
bun run bundle:server    # Bundle HTTP server into src-tauri/binaries/
bun run setup:sidecar    # Setup dev sidecar (Bun binary + bundled server)
bun run build:release    # Create distributable Tauri app
```

## Architecture

### Client-Server Model

The desktop app is a **thin Tauri shell** around a shared UI package. The actual architecture is:

```
Tauri window (Rust)
  └── React frontend (packages/ui)
        └── Effect.js RPC over WebSocket
              └── Embedded Bun HTTP server (sidecar)
                    └── Effect.js services (storage, git, worktrees, sessions)
```

On launch, the Rust side spawns a **Bun sidecar** (`src-tauri/binaries/server.js`) that runs the HTTP server from `apps/http`. The frontend discovers the sidecar port via the `get_server_port` Tauri command, then connects over RPC/WebSocket.

### Key Directories

- `src/` - Desktop-specific React code (thin: entry point, updater, platform bindings)
- `src-tauri/src/` - Rust code: sidecar management, markdown parsing, macOS dock badges, ProMotion 120fps unlock
- `src-tauri/binaries/` - Runtime artifacts: bundled `server.js` and `bun` executable
- `packages/ui/` - Shared UI (all features, components, chat, sidebar, settings)
- `apps/http/` - HTTP server that gets bundled as the sidecar

### Frontend Entry (`src/main.tsx`)

Initializes the platform context with Tauri-specific implementations (file dialogs, clipboard, dock badges, markdown parsing via Rust), sets up the updater provider, then renders `Layout` from `@sandcastle/ui`.

### Rust Modules (`src-tauri/src/`)

- **lib.rs** - App setup, plugin initialization, window config (1440x900), sidecar lifecycle
- **sidecar.rs** - Spawns Bun process, parses port from stdout (`SANDCASTLE_SERVER_PORT=XXXXX`), health checks `/api/health`
- **dock.rs** - macOS dock badge via Cocoa/objc (no-op on other platforms)
- **markdown.rs** - Markdown→HTML via comrak with GFM extensions
- **high_refresh_rate.rs** - Unlocks 120fps on macOS ProMotion via private WebKit APIs

### Monorepo Context

This app depends on workspace packages:
- `@sandcastle/ui` - All React UI components, features, and state management
- `@sandcastle/rpc` - RPC schema definitions (shared with HTTP server)

Most UI work happens in `packages/ui/`, not in this app's `src/`. The desktop app's `src/` is primarily platform bindings.

### Effect.js and effect-atom

The app uses Effect.js for service composition and RPC. State management in the UI uses `effect-atom` (jotai-like atoms powered by Effect). Read `docs/effect-atom-guide.md` before working with atoms.
