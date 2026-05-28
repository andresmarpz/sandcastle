# Sandcastle Directory Layout

> Companion to `docs/architecture.md`. Defines the monorepo layout for the MVP.

## §0. Top level

pnpm workspace, Turbo for task running.

```
sandcastle/
├── apps/
│   ├── server/                # Bun server
│   └── desktop/               # Electron + React client
├── packages/
│   ├── entities/              # Domain entities: Project, Workspace, branded IDs
│   └── contracts/             # WS RPC group + typed errors
├── docs/
│   ├── architecture.md
│   ├── directories.md         # this file
│   ├── db.md
│   └── rpc-contract.md
├── patches/                   # pnpm patch-package outputs
├── package.json               # root scripts; private
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json              # root TS base
└── turbo.json
```

Workspaces:

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

Two packages in MVP. They form a strict layering chain:

```
                 @sandcastle/contracts
                          │  uses entity types in RPC payloads
                          ▼
                 @sandcastle/entities
```

| Consumer | Depends on |
|---|---|
| `apps/server/src/db/*` (repos) | `entities` |
| `apps/server/src/rpc/*` (handlers) | `contracts` (transitively `entities`) |
| `apps/desktop` lists / project views | `entities` |
| `apps/desktop` RPC client | `contracts` |

We add new packages only when something is genuinely shared. ACP, blob, normalizer, and stream packages from the earlier design are gone with the MVP pivot.

---

## §1. `packages/entities/`

Domain shapes. The "what data IS" layer, transport-agnostic.

```
packages/entities/
├── src/
│   ├── index.ts
│   ├── ids.ts                 # branded IDs: ProjectId, WorkspaceId
│   ├── time.ts                # IsoDateTime schema + helpers
│   ├── project.ts             # Project
│   └── workspace.ts           # Workspace, WorkspaceKind, WorkspaceCreateConfig
├── package.json               # deps: effect
└── tsconfig.json
```

Conventions:
- Entities are **decoded** shapes. The DB layer encodes/decodes; the RPC layer returns these as-is.
- Branded IDs live here. Other tables / future entities reuse the same brand.
- No transport awareness. No RPC, no SQL.
- Package name: `@sandcastle/entities`.

---

## §2. `packages/contracts/`

The WS RPC contract — what the server implements and the client calls.

```
packages/contracts/
├── src/
│   ├── index.ts
│   ├── errors.ts              # typed error union (ProjectPathInvalid, WorktreeCreateFailed, …)
│   └── rpc/
│       ├── index.ts           # SandcastleRpc group export
│       ├── projects.ts        # projects.{list, create, rename, delete}
│       └── workspaces.ts      # workspaces.{list, create, delete}
├── package.json               # deps: effect, @effect/rpc, @sandcastle/entities
└── tsconfig.json
```

Conventions:
- `rpc/` is one file per logical group; all merged into one `SandcastleRpc` group at `rpc/index.ts`.
- RPC method payloads and return values reference **entity** types directly.
- Package name: `@sandcastle/contracts`.

---

## §3. `apps/server/`

Bun server. Effect-based, layered. Implements `SandcastleRpc`.

```
apps/server/
├── src/
│   ├── main.ts                # entrypoint: build runtime, start HTTP listener
│   ├── runtime.ts             # ManagedRuntime + top-level Layer composition
│   ├── db/
│   │   ├── client.ts          # bun:sqlite Service
│   │   ├── migrations.ts      # in-house runner
│   │   └── repos/
│   │       ├── projects.ts
│   │       └── workspaces.ts
│   ├── http/
│   │   ├── server.ts          # Bun.serve, HTTP+WS listener
│   │   └── upgrade.ts         # WS upgrade handler → RpcServer
│   ├── rpc/                   # handlers implementing SandcastleRpc
│   │   ├── index.ts
│   │   ├── projects.ts
│   │   └── workspaces.ts
│   ├── projects/
│   │   └── ProjectService.ts
│   ├── workspaces/
│   │   └── WorkspaceService.ts
│   ├── git/
│   │   ├── probe.ts           # is-git detection (git rev-parse)
│   │   ├── worktree.ts        # `git worktree add` / `remove`
│   │   └── exec.ts            # thin wrapper around git CLI
│   └── lib/
│       ├── ids.ts             # ID generators
│       ├── paths.ts           # ~/.sandcastle path helpers
│       └── time.ts            # clock service
├── migrations/
│   └── 001_init.sql
├── package.json
└── tsconfig.json
```

Conventions:
- **Effect Services everywhere.** Wiring happens in `runtime.ts`.
- **Services are the boundary.** Handlers in `rpc/*.ts` call `ProjectService` / `WorkspaceService`; never repos or git helpers directly.
- **One repo per table**, each a thin Service.
- **Migrations are raw SQL.** Filenames `NNN_description.sql`.

---

## §4. `apps/desktop/`

Electron app with a React renderer. Vite for the renderer; tsc (or esbuild) for main + preload.

```
apps/desktop/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # app lifecycle, window creation
│   │   ├── window.ts
│   │   ├── ipc.ts             # minimal IPC bridge
│   │   └── menu.ts
│   ├── preload/
│   │   └── index.ts           # exposes a small bridge (native dialogs, node-pty handles)
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── rpc/
│       │   └── client.ts      # Effect RPC client over WS; reconnect policy
│       ├── state/             # TBD: store + query layer
│       │   └── README.md
│       ├── routes/
│       │   ├── _root.tsx
│       │   ├── projects.tsx
│       │   └── projects.$projectId.tsx
│       ├── features/
│       │   ├── projects/
│       │   │   ├── ProjectList.tsx
│       │   │   └── ProjectCreateDialog.tsx
│       │   ├── workspaces/
│       │   │   ├── WorkspaceList.tsx
│       │   │   └── WorkspaceCreateDialog.tsx
│       │   └── terminal/
│       │       ├── TabBar.tsx
│       │       ├── SplitView.tsx          # recursive horizontal/vertical splits
│       │       ├── TerminalPane.tsx       # xterm.js attached to a node-pty handle
│       │       ├── pty.ts                 # node-pty wrapper (via preload bridge)
│       │       └── layoutStore.ts         # per-workspace tab + split layout (local)
│       ├── components/
│       │   ├── Button.tsx
│       │   ├── Dialog.tsx
│       │   └── ...
│       ├── lib/
│       │   ├── format.ts
│       │   ├── time.ts
│       │   └── classnames.ts
│       └── styles/
│           └── globals.css
├── electron-builder.yml
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
└── vite.config.ts
```

Conventions:
- **Layout (tabs, splits, panes) is local state.** Persisted in Electron `userData`, keyed by `workspaceId`.
- **PTYs run in the client.** `node-pty` is loaded in the preload (or main) process and exposed to the renderer via a typed bridge. `xterm.js` renders the terminal in the renderer.
- **No streaming RPCs needed in MVP.** Lists are refetched after mutations.
- **`state/`** is a placeholder; the store choice will land when we feel the friction.

---

## §5. Where each architecture concept lives

| `architecture.md` section | Code path |
|---|---|
| §3.1 Server actors | `apps/server/src/main.ts`, `runtime.ts` |
| §3.2 Client actors | `apps/desktop/src/{main,preload,renderer}` |
| §5.1 Project entity | `packages/entities/src/project.ts` |
| §5.2 Workspace entity | `packages/entities/src/workspace.ts` |
| §5.2 Worktree management | `apps/server/src/git/worktree.ts` |
| §5.3 Tabs / panes (client) | `apps/desktop/src/renderer/features/terminal/*` |
| §6.2 SQLite schema | `apps/server/migrations/001_init.sql` |
| §6.3 Reconciliation | `apps/server/src/workspaces/WorkspaceService.ts` (startup hook) |
| §7 RPC method declarations | `packages/contracts/src/rpc/*.ts` |
| §7 RPC handler implementations | `apps/server/src/rpc/*.ts` |
| Branded IDs | `packages/entities/src/ids.ts` |
| Typed RPC errors | `packages/contracts/src/errors.ts` |

---

## §6. Naming and import conventions

- Workspace package names use the `@sandcastle/` scope: `@sandcastle/entities`, `@sandcastle/contracts`. Apps are private.
- Imports inside a package use relative paths within `src/`. Cross-package imports use the workspace name.
- **Dependency direction is strictly downward:** `contracts → entities`. Never reverse.
- Server repos depend on `@sandcastle/entities` only — never on `@sandcastle/contracts`. Keeps persistence transport-agnostic.
- TypeScript path aliases (e.g. `@/features/...`) stay inside their own app; cross-app sharing goes through a workspace package.

---

## §7. What we deliberately don't have (yet)

- **No `packages/acp/`.** ACP is gone with the MVP pivot.
- **No `packages/ui/` shared component library.** One frontend in MVP; sharing across nothing is overhead.
- **No `apps/mobile/` or second frontend.** When/if we add one, it consumes `@sandcastle/contracts` exactly like desktop.
- **No `tools/` or `scripts/` at the root.** Turbo + each app's `package.json` covers what we need.
- **No `apps/server-cli/`.** Configuration lives in code defaults for now; CLI tooling lands when we feel the pain.
