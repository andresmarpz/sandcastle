# Sandcastle Directory Layout

> Companion to `docs/architecture.md`. Defines the monorepo layout for v1: where each piece of `architecture.md` actually lives in code.

## §0. Top level

pnpm workspace, Turbo for task running.

```
sandcastle/
├── apps/
│   ├── server/                # Bun API server (the relay)
│   └── desktop/               # Electron + React frontend
├── packages/
│   ├── acp/                   # ACP type re-exports (with _meta stripped)
│   ├── entities/              # Domain entities: Workspace, Session, Turn, Blob, capabilities, IDs
│   └── contracts/             # WS RPC group, StreamItem, ServerEvent, typed errors
├── docs/
│   ├── architecture.md
│   ├── directories.md         # this file
│   └── db.md
├── patches/                   # pnpm patch-package outputs
├── package.json               # root scripts; private
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json              # root TS base; apps & packages extend
└── turbo.json
```

Workspaces:

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

We add new packages only when something is genuinely shared by both `apps/server` and `apps/desktop` (or by future second-frontend code). The bar is high. v1 has three: `acp` (ACP wire types), `entities` (our domain shapes), and `contracts` (the WS RPC surface). They form a strict layering chain — each depends only on the ones below it.

```
                 @sandcastle/contracts
                          │  uses entity types in RPC payloads & stream
                          ▼
                 @sandcastle/entities
                          │  uses ACP types in entity fields (e.g. ModelSelection)
                          ▼
                  @sandcastle/acp
```

The split lets each consumer depend on the minimum it needs:

| Consumer | Depends on |
|---|---|
| `apps/server/src/db/*` (repos) | `entities` |
| `apps/server/src/agents/normalizers/*` | `acp`, `entities` |
| `apps/server/src/sessions/*` | `entities`, `contracts` (for `ServerEvent`) |
| `apps/server/src/rpc/*` (handlers) | `contracts` (transitively `entities` + `acp`) |
| `apps/desktop` renderer `blocks/*` (ACP renderers) | `acp` |
| `apps/desktop` list views, session metadata | `entities` |
| `apps/desktop` RPC client | `contracts` |

---

## §1. `packages/acp/`

ACP wire-type re-exports. The single point of truth for "the ACP schema as it exists upstream, slightly tightened for our renderer."

```
packages/acp/
├── src/
│   ├── index.ts                  # public re-exports
│   ├── content.ts                # ContentBlock, ImageContent, ResourceLink, …
│   ├── session.ts                # SessionUpdate, ToolCall, ToolCallUpdate, Plan, ThoughtChunk, …
│   ├── permission.ts             # PermissionOption, PermissionOutcome, RequestPermissionRequest
│   ├── elicitation.ts            # ElicitationCreateRequest, ElicitationResponse
│   ├── modes.ts                  # SessionMode, SessionModeId
│   ├── models.ts                 # ModelInfo, ModelId, ModelSelection
│   ├── stop.ts                   # StopReason
│   └── capabilities.ts           # AgentCapabilities (raw, pre-normalization)
├── package.json                  # deps: effect, @agentclientprotocol/sdk
└── tsconfig.json
```

Key conventions:

- This package is the **only** place in the monorepo that may directly `import from "@agentclientprotocol/sdk"`. Everywhere else uses `@sandcastle/acp`.
- Re-exported types **strip `_meta`** at the type level. Consumers cannot accidentally depend on vendor-specific fields. (The server's normalizer layer reads `_meta` from raw incoming ACP messages before they cross this boundary.)
- No business logic, no schemas of our own. Pure type/Schema re-exports.
- Package name: `@sandcastle/acp`.

---

## §2. `packages/entities/`

Our domain shapes. The "what data IS" layer, independent of how it's transported.

```
packages/entities/
├── src/
│   ├── index.ts                  # public re-exports
│   ├── ids.ts                    # branded IDs: WorkspaceId, SessionId, TurnId, ToolCallId, PermissionRequestId, ElicitationRequestId, BlobHash, SequenceNumber, ClientId
│   ├── time.ts                   # IsoDateTime schema + helpers
│   ├── workspace.ts              # Workspace
│   ├── session.ts                # SessionRecord, NewSessionConfig, WorktreeMode, AgentKind
│   ├── turn.ts                   # Turn, TurnSummary, TurnStatus
│   ├── blob.ts                   # Blob
│   ├── capabilities.ts           # NormalizedCapabilities  (uses ACP ModelInfo/SessionMode)
│   ├── pending.ts                # PendingRequestSummary
│   └── snapshot.ts               # SessionSnapshot         (uses ACP SessionUpdate[])
├── package.json                  # deps: effect, @sandcastle/acp
└── tsconfig.json
```

Key conventions:

- Entities are **decoded** shapes. The DB layer encodes/decodes JSON columns into these; the RPC layer returns these as-is. There is one Session shape from the rest of the app's perspective.
- Entities may contain ACP types in fields (e.g. `Session.modelSelection: ModelSelection`). This is the only direction the dependency goes.
- Entities never know about RPC, persistence, or transport. They are pure schemas.
- Branded IDs live here because they are entity-level concepts. If we ever need them in non-entity contexts, we have not regretted it yet.
- Package name: `@sandcastle/entities`.

---

## §3. `packages/contracts/`

The WS RPC contract — what the server implements and the frontend calls. Everything here is "transport surface."

```
packages/contracts/
├── src/
│   ├── index.ts                  # public re-exports
│   ├── errors.ts                 # typed error union (workspace-not-found, agent-spawn-failed, capability-not-supported, worktree-create-failed, agent-rejected-prompt, …)
│   ├── stream/
│   │   ├── item.ts               # StreamItem envelope: snapshot | agent | server
│   │   └── events.ts             # ServerEvent discriminated union (turn-started, permission-requested, agent-respawned, …)
│   └── rpc/
│       ├── index.ts              # SandcastleRpc group export
│       ├── workspaces.ts         # workspaces.list / create / rename / delete
│       ├── sessions.ts           # sessions.list / subscribe / sendPrompt / cancelTurn / setMode / setModel / rename / delete / respondPermission / respondElicitation / fetchToolOutput
│       └── server.ts             # server.listAgentKinds / server.getCapabilities / client.declareFocus
├── package.json                  # deps: effect, @effect/rpc, @sandcastle/acp, @sandcastle/entities
└── tsconfig.json
```

Key conventions:

- `rpc/` is one file per logical group; all merged into one `SandcastleRpc` group at `rpc/index.ts`.
- RPC method payload and return types reference **entity** types directly (e.g. `sessions.list → SessionRecord[]`). This is why we want entities as a separate package: typed RPC return values reuse the same shape the DB and renderer use.
- `ServerEvent` is the home for everything ACP doesn't model. It may reference both entity and ACP types in its variants.
- No `domain/` or `acp/` subtrees here anymore — those moved to dedicated packages.
- Package name: `@sandcastle/contracts`.

---

## §4. `apps/server/`

Bun server. Effect-based, layered. Implements `SandcastleRpc` from `@sandcastle/contracts`.

```
apps/server/
├── src/
│   ├── main.ts                   # entrypoint: build runtime, start HTTP listener
│   ├── runtime.ts                # ManagedRuntime + top-level Layer composition (§13.3)
│   ├── config/
│   │   ├── schema.ts             # config.json schema
│   │   ├── load.ts               # reads ~/.sandcastle/config.json + defaults
│   │   ├── defaults.ts           # default config values + paths
│   │   └── ConfigService.ts      # Effect Service exposing live config
│   ├── db/
│   │   ├── client.ts             # Bun SQLite Service
│   │   ├── migrations.ts         # in-house runner: applies apps/server/migrations/*.sql
│   │   └── repos/                # one repo per table; each Effect Service
│   │       ├── workspaces.ts
│   │       ├── sessions.ts
│   │       ├── turns.ts
│   │       ├── events.ts
│   │       ├── blobs.ts
│   │       ├── pendingRequests.ts
│   │       └── workspaceMcpOverrides.ts
│   ├── http/
│   │   ├── server.ts             # HTTP+WS listener (Bun's Bun.serve)
│   │   ├── upgrade.ts            # WS upgrade handler, hands off to RpcServer
│   │   └── routes/
│   │       ├── blobs.ts          # GET /blobs/{hash}
│   │       └── upload.ts         # POST /blobs/upload (placeholder for v1)
│   ├── rpc/                      # WS RPC handlers — implement SandcastleRpc
│   │   ├── index.ts              # composes group handler from per-group modules
│   │   ├── workspaces.ts
│   │   ├── sessions.ts
│   │   └── server.ts
│   ├── workspaces/
│   │   ├── WorkspaceService.ts
│   │   └── relocation.ts         # periodic existence check (§10.10)
│   ├── sessions/
│   │   ├── SessionService.ts     # the boundary layer (§13.2)
│   │   ├── firstPrompt.ts        # the transactional first-prompt flow (§10.1)
│   │   ├── fanout.ts             # per-session subscriber set + ring buffer
│   │   ├── snapshot.ts           # rebuild SessionSnapshot from events
│   │   ├── eviction.ts           # idle eviction job
│   │   └── publish.ts            # the single publish-point: tx → ring → fan-out
│   ├── agents/
│   │   ├── AgentRegistry.ts      # bind/release/lookup of AcpClient per session
│   │   ├── spawn.ts              # subprocess fork helpers
│   │   ├── client.ts             # effect-acp client wrapper (server side of stdio)
│   │   ├── handlers.ts           # ClientRpcs handlers: fs/*, terminal/*, permission, elicitation
│   │   ├── auth.ts               # per-agent-kind auth flow (§10.6)
│   │   └── normalizers/
│   │       ├── index.ts          # picks normalizer by AgentKind
│   │       ├── claude.ts         # claude-agent-acp _meta + capability normalization
│   │       └── gemini.ts         # placeholder until we wire gemini-acp
│   ├── blobs/
│   │   └── BlobStore.ts          # ~/.sandcastle/blobs reader/writer; rewrite ImageContent → URI
│   ├── git/
│   │   ├── probe.ts              # is_git detection
│   │   ├── worktree.ts           # `git worktree add` / `remove`
│   │   └── exec.ts               # thin wrapper around git CLI
│   ├── policy/
│   │   └── WorkspacePolicy.ts    # interface + permissive v1 impl (§10.4)
│   ├── telemetry/
│   │   ├── tracer.ts             # OTel tracer setup
│   │   └── logger.ts             # structured-JSON logger
│   ├── auth/
│   │   └── handshake.ts          # placeholder for future app-level auth (no-op in v1)
│   └── lib/
│       ├── ids.ts                # ID generators (branded)
│       ├── paths.ts              # ~/.sandcastle path helpers
│       └── time.ts               # clock service
├── migrations/                   # raw SQL migrations
│   ├── 001_init.sql
│   └── _migrations.sql           # bookkeeping table (created by the runner)
├── package.json
└── tsconfig.json
```

Conventions:

- **Effect Services everywhere.** Every dependency-injected thing is a `Effect.Service`. Wiring happens in `runtime.ts`.
- **`SessionService` is the boundary.** WS handlers in `rpc/sessions.ts` call `SessionService` only; never `AgentRegistry` or `AcpClient` directly. Same for `WorkspaceService`.
- **One file per RPC group at the handler layer**, mirroring `packages/contracts/src/rpc/`.
- **One repo per table**, each a thin Service. Cross-table operations live in higher-level services (e.g. `firstPrompt.ts` orchestrates several repos in one transaction).
- **Migrations are raw SQL.** Filenames `NNN_description.sql`, applied in lex order by `db/migrations.ts`. The runner records applied versions in a `_migrations` table.
- **Agents are pluggable.** Adding `gemini-acp` = adding `agents/normalizers/gemini.ts` + a `defaultModel` entry in config. Spawning logic in `spawn.ts` is generic.

---

## §5. `apps/desktop/`

Electron app with a React renderer. Vite for the renderer, esbuild (or tsc) for main + preload.

> The state-management layer is TBD per `architecture.md` §16. The structure below leaves a `state/` directory as the single landing pad so we can drop in the chosen library without sprawl.

```
apps/desktop/
├── src/
│   ├── main/                     # Electron main process
│   │   ├── index.ts              # app lifecycle, window creation
│   │   ├── window.ts             # BrowserWindow setup
│   │   ├── ipc.ts                # IPC bridge (limited; most state via WS, not IPC)
│   │   └── menu.ts
│   ├── preload/
│   │   └── index.ts              # exposes a minimal bridge (e.g. native dialogs, app version)
│   └── renderer/                 # React UI
│       ├── index.html
│       ├── main.tsx              # mounts <App/>
│       ├── App.tsx               # router root + global providers
│       ├── rpc/
│       │   ├── client.ts         # Effect RPC client over WS; reconnect policy
│       │   ├── http.ts           # fetch helpers for /blobs/{hash}
│       │   └── subscribe.ts      # subscribeSession helper: snapshot+live → reduced state
│       ├── state/                # TBD: store + query layer
│       │   ├── README.md         # documents the chosen approach when we pick
│       │   └── ...
│       ├── routes/               # if using a router (TanStack Router likely)
│       │   ├── _root.tsx
│       │   ├── server-picker.tsx
│       │   ├── workspaces.tsx
│       │   └── sessions.$sessionId.tsx
│       ├── features/             # one folder per top-level feature
│       │   ├── server-picker/
│       │   │   ├── ServerPicker.tsx
│       │   │   ├── ServerList.tsx
│       │   │   └── connectionStore.ts        # locally-persisted server entries
│       │   ├── workspaces/
│       │   │   ├── WorkspaceList.tsx
│       │   │   └── WorkspaceCreateDialog.tsx
│       │   ├── sessions/
│       │   │   ├── SessionList.tsx
│       │   │   └── SessionRow.tsx
│       │   └── chat/
│       │       ├── ChatView.tsx              # subscribes to session; renders history
│       │       ├── PromptInput.tsx           # compose UI; first-prompt config dropdown
│       │       ├── PromptInput.worktreeMenu.tsx
│       │       └── blocks/                    # one renderer per ACP content/update kind
│       │           ├── TextBlock.tsx
│       │           ├── ToolCallBlock.tsx     # incl. nested sub-agent rendering
│       │           ├── PlanBlock.tsx
│       │           ├── ThinkingBlock.tsx
│       │           ├── ImageBlock.tsx
│       │           └── unknownBlock.tsx      # graceful fallback for unknown variants
│       ├── components/                       # shared UI primitives
│       │   ├── Button.tsx
│       │   ├── Dialog.tsx
│       │   ├── Dropdown.tsx
│       │   └── ...
│       ├── lib/
│       │   ├── format.ts                     # text utilities
│       │   ├── time.ts                       # IsoDateTime → user-local
│       │   └── classnames.ts
│       └── styles/
│           └── globals.css
├── electron-builder.yml          # packaging config
├── package.json
├── tsconfig.json
├── tsconfig.main.json            # main + preload (CommonJS / Node target)
├── tsconfig.renderer.json        # renderer (ESM / browser target)
└── vite.config.ts
```

Conventions:

- **Renderer never imports from `@agentclientprotocol/sdk` directly.** ACP rendering imports from `@sandcastle/acp`; list/metadata views from `@sandcastle/entities`; RPC client from `@sandcastle/contracts`.
- **`features/`-style organization**: each feature owns its components, hooks, and local state. Shared primitives go in `components/`.
- **`blocks/`** is the closed registry of ACP content/update renderers. Adding a new ACP variant means adding a new block file plus a switch case. The `unknownBlock.tsx` fallback prevents a new agent emitting an unknown variant from crashing the UI.
- **`rpc/subscribe.ts`** is the load-bearing helper: takes a `sessionId`, returns a stream of `StreamItem`s reduced into a session view-model. The state library (TBD) consumes this.
- **`state/README.md`** is a placeholder we update when we lock in the store choice. Until then nothing else lives in `state/`.
- **Electron-specific code is kept thin.** Most "native" needs (file picker for workspace path, server discovery) eventually become server RPCs (server-side directory browser, broadcast list endpoints). Main/preload should not accumulate business logic.

---

## §6. Where each architecture concept actually lives

Quick lookup table mapping `architecture.md` sections to code paths:

| `architecture.md` section | Code path |
|---|---|
| §5.1 Workspace entity | `packages/entities/src/workspace.ts` |
| §5.2 Session entity | `packages/entities/src/session.ts` |
| §5.3 Turn | `packages/entities/src/turn.ts` |
| §5.4 Worktree management | `apps/server/src/git/worktree.ts` |
| §5.5 Blob (entity) | `packages/entities/src/blob.ts` |
| §5.5 Blob (storage) | `apps/server/src/blobs/BlobStore.ts` |
| §6.2 SQLite schema | `apps/server/migrations/001_init.sql` |
| §6.3 Migration runner | `apps/server/src/db/migrations.ts` |
| §6.5 Ring buffer | `apps/server/src/sessions/fanout.ts` |
| §6.6 Idle eviction | `apps/server/src/sessions/eviction.ts` |
| §6.7 Config file | `apps/server/src/config/*` |
| §7.1 Spawn lifecycle | `apps/server/src/agents/spawn.ts` + `AgentRegistry.ts` |
| §7.2 ACP groups | `apps/server/src/agents/client.ts` (defines and uses both groups) |
| §7.3 Capability normalization | `apps/server/src/agents/normalizers/*.ts` (output type in `packages/entities/src/capabilities.ts`) |
| §7.4 `_meta` normalization | `apps/server/src/agents/normalizers/*.ts` |
| §8 Subscribe stream | `apps/server/src/sessions/{fanout,publish,snapshot}.ts` |
| §8.1 StreamItem envelope | `packages/contracts/src/stream/item.ts` |
| §8.6 ServerEvent union | `packages/contracts/src/stream/events.ts` |
| §9 RPC method declarations | `packages/contracts/src/rpc/*.ts` |
| §9 RPC handler implementations | `apps/server/src/rpc/*.ts` |
| §10.1 First-prompt transaction | `apps/server/src/sessions/firstPrompt.ts` |
| §10.4 `fs/*` and `terminal/*` handlers | `apps/server/src/agents/handlers.ts` |
| §10.5 Permission/elicitation routing | `apps/server/src/sessions/SessionService.ts` (route + persist), `apps/server/src/db/repos/pendingRequests.ts` |
| §10.6 Auth flow | `apps/server/src/agents/auth.ts` |
| §10.10 Workspace relocation check | `apps/server/src/workspaces/relocation.ts` |
| §12 Image blob URI rewrite | `apps/server/src/blobs/BlobStore.ts` (call site in `agents/normalizers/*.ts`) |
| §13.3 Layer composition | `apps/server/src/runtime.ts` |
| §14 Startup | `apps/server/src/main.ts` |
| §16 Frontend renderer | `apps/desktop/src/renderer/features/chat/blocks/*` |
| ACP type re-exports | `packages/acp/src/*.ts` |
| Branded IDs | `packages/entities/src/ids.ts` |
| Typed RPC errors | `packages/contracts/src/errors.ts` |

---

## §7. Naming and import conventions

- Workspace package names use the `@sandcastle/` scope: `@sandcastle/acp`, `@sandcastle/entities`, `@sandcastle/contracts`, plus the private apps.
- Server and desktop are private (`"private": true`) — no publishing.
- Imports inside an app/package use relative paths (`./foo/bar`) within `src/`. Imports across packages use the workspace name.
- **The dependency direction is strictly downward**: `contracts` → `entities` → `acp`. Never reverse, never sideways.
- **Only `packages/acp/src/*.ts` may import from `@agentclientprotocol/sdk`.** Every other file imports ACP types from `@sandcastle/acp`.
- **Renderer ACP imports** come from `@sandcastle/acp` only. List/metadata views import entity types from `@sandcastle/entities`. The RPC client imports from `@sandcastle/contracts`.
- **Server DB repos** depend on `@sandcastle/entities` only — never on `@sandcastle/contracts`. This keeps the persistence layer transport-agnostic.
- TypeScript path aliases inside an app point at its own `src/` (e.g. `@/features/chat`). They do not reach across apps; cross-app shared code must live in a workspace package.

---

## §8. What we deliberately don't have (yet)

- **No `apps/server-cli/` or admin tools.** Configuration is by editing `~/.sandcastle/config.json` and restarting. CLI tooling lands when we feel the pain.
- **No `packages/ui/` shared component library.** Sandcastle has one frontend in v1; sharing primitives across nothing is overhead.
- **No `packages/effect-acp/`.** The effect-flavored ACP wrapper lives inside `apps/server/src/agents/` because only the server uses it. If a second consumer ever appears (unlikely), we extract.
- **No mobile app folder.** When we add one, it becomes `apps/mobile/` and consumes `@sandcastle/contracts` exactly like desktop. The renderer-side `features/` and `blocks/` patterns translate; only `main`/`preload`/Vite become RN-specific.
- **No `tools/` or `scripts/` at the root.** Turbo + each app's `package.json` covers what we need.
