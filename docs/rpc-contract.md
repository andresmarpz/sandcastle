# Sandcastle WS RPC Contract — v0 (initial slice)

> **Status:** v0 / first usable slice. Three operations are enough to wire up
> an end-to-end "send a prompt and stop." Everything else (subscribe, list,
> cancel, mode/model switching, permissions UI) lands in subsequent slices.
> Companion to `architecture.md` §9.

This document specifies the **first three** RPC operations the frontend can
call on the server. The contract here is locked once we ship it — adding
methods later is additive, but the shape of these three should not change
without a versioning conversation.

---

## §0. Scope

Three user-visible operations:

1. **Create a workspace** — register a server-side directory as a place where
   sessions can run.
2. **Create a session within a workspace + send its first prompt** — these
   are *one* transactional RPC by architectural commitment (`architecture.md`
   §5.2, §10.1). Sessions are created lazily on first prompt; no DB row
   exists during the compose UI state.
3. **Send a subsequent prompt to an existing session** — same RPC method as
   (2), different `target` discriminator.

(2) and (3) are the same RPC because the architecture treats "session
creation" as a side-effect of the first-prompt transaction. There is no
`sessions.create` method, and there will not be one in v1.

### §0.1 Out of scope for v0

These are deliberately deferred. They are not blocked on contract design;
they're the next slice.

- `sessions.subscribe` — without this, prompts are fire-and-forget from the
  frontend's perspective. The server still persists everything; the UI just
  can't observe streaming output yet. **This is the obvious next addition.**
- `workspaces.list`, `workspaces.rename`, `workspaces.delete`
- `sessions.list`, `sessions.cancelTurn`, `sessions.setMode`, `sessions.setModel`,
  `sessions.rename`, `sessions.delete`
- `sessions.respondPermission`, `sessions.respondElicitation`
- `server.listAgentKinds`, `server.getCapabilities`
- Auth flows. v0 assumes the agent is already authenticated locally.

### §0.2 What v0 lets you do

- Add a workspace pointing at a local directory.
- Send a first prompt to a brand-new session in that workspace, with
  `claude-agent-acp` running locally.
- Send another prompt to that same session.
- Verify in SQLite (`events` / `turns` / `sessions` tables) that the agent
  produced output, even though the UI can't render it yet.

That is the minimum loop for "frontend can talk to any ACP agent." The rest
is built incrementally on top.

---

## §1. Entity references (placeholders)

Real schemas land in `@sandcastle/entities` (`packages/entities/`) in a
follow-up. For this document, treat the following as opaque placeholders
with the obvious shape:

```ts
type WorkspaceId    = string  // branded
type SessionId      = string  // branded
type TurnId         = string  // branded
type AbsolutePath   = string  // server-side absolute path
type IsoDateTime    = string

type AgentKind      = "claude"   // v0 supports claude only; "gemini" later

type Workspace = {
  id:        WorkspaceId
  label:     string
  path:      AbsolutePath
  isGit:     boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

// Imported as-is from @sandcastle/acp (which re-exports from @agentclientprotocol/sdk
// with _meta stripped). See docs/acp.md §8.
type ContentBlock =
  | { type: "text";          text: string }
  | { type: "image";         data: string; mimeType: string; uri?: string }
  | { type: "audio";         data: string; mimeType: string }
  | { type: "resource_link"; name: string; uri: string; /* ... */ }
  | { type: "resource";      uri: string;  /* ... */ }
```

Anything else referenced below (`WorktreeMode`, `NewSessionConfig`) is
defined inline in this document.

---

## §2. The three RPCs

All methods belong to one `RpcGroup` (`SandcastleRpc`) on the WS endpoint
`/rpc`. Method-name-to-group mapping mirrors `packages/contracts/src/rpc/`.

### §2.1 `workspaces.create`

Register a server-side directory as a workspace.

```ts
workspaces.create({
  label: string,
  path:  AbsolutePath,            // must exist on the server filesystem
}) → Workspace
```

Server behavior:

1. Reject if `path` is not absolute or does not exist or is not a directory.
2. Reject if a non-deleted workspace already has the same `path`.
3. Probe `git rev-parse --is-inside-work-tree` to set `isGit`.
4. Insert the workspace row; return the persisted `Workspace`.

Notes:
- `label` is purely for display; the server does not enforce uniqueness.
- v0 does **not** include a `relocate` operation. If the directory disappears
  later, the user must `delete` and re-`create`. Relocation flows are in
  `architecture.md` §10.10 / §17 (deferred).
- The `path` is canonical and immutable for the lifetime of the workspace.

### §2.2 `sessions.sendPrompt`

The dual-use RPC: creates a session **and** sends its first prompt when
`target.kind === "new"`; sends a subsequent prompt when
`target.kind === "existing"`.

```ts
sessions.sendPrompt({
  target:
    | { kind: "new";      config: NewSessionConfig }
    | { kind: "existing"; sessionId: SessionId },
  content: ContentBlock[],        // the user's prompt; usually [{type:"text", text}]
}) → { sessionId: SessionId; turnId: TurnId }

type NewSessionConfig = {
  workspaceId:    WorkspaceId
  agentKind:      AgentKind            // v0: "claude"
  worktreeMode:   WorktreeMode
  // modelSelection deliberately omitted in v0; server uses the agent's
  // configured default model from ~/.sandcastle/config.json (architecture.md §6.7).
  // Add to NewSessionConfig in a later slice without breaking the shape.
}

type WorktreeMode =
  | { kind: "local" }                              // run agent in workspace.path
  | { kind: "worktree"; baseBranch: string | null } // git worktree off baseBranch
                                                    // (default: workspace HEAD)
```

#### §2.2.1 `target: "new"` — the first-prompt transaction

The full sequence (`architecture.md` §10.1) executes server-side as one
logical transaction. Either every step lands or every preceding side-effect
is rolled back:

1. Validate workspace exists and is active.
2. Resolve `workdir`:
   - `local` → `workspace.path`
   - `worktree` → `~/.sandcastle/worktrees/{workspaceId}/{sessionId}`
3. If worktree mode: `git worktree add -b sandcastle/{sessionIdShort} ...`.
4. Insert the `sessions` row.
5. Spawn the agent process with `cwd = workdir`.
6. ACP `initialize`; capture and normalize `agentCapabilities`.
7. ACP `authenticate` if the agent reports `auth_required`.
   *v0:* if this fires, return an `auth-required` error; UI cannot drive the
   flow yet. Authenticate locally (e.g. run `claude /login`) and retry.
8. ACP `session/new` (or `session/load` on respawn — N/A on first prompt).
9. Insert the `turns` row, status `running`.
10. ACP `session/prompt(content)`.
11. Commit. Emit `turn-started` and `capabilities-changed` ServerEvents
    (visible later when `subscribe` lands).

Returns when the agent has **accepted** the prompt (step 10 returned without
error). The agent's streaming output flows into SQLite + the in-memory ring
(`architecture.md` §6.5) and will be deliverable via `subscribe` once that
RPC ships. In v0, observe progress via the SQLite `events` table.

#### §2.2.2 `target: "existing"` — subsequent prompt

```
1. Look up session by sessionId; reject if soft-deleted.
2. If the agent process is not bound (idle-evicted or never bound since a
   restart), run the spawn lifecycle (`architecture.md` §7.1):
   - re-spawn agent
   - ACP initialize / authenticate
   - ACP session/load if supported, else session/new + replay
   - emit `agent-respawned` ServerEvent
3. Assign turnId; insert turns row (status=running). Emit `turn-started`.
4. ACP session/prompt(content). Return { sessionId, turnId }.
```

The frontend cannot tell whether the agent was already running or had to be
respawned — that's intentional and architecturally normalized away.

#### §2.2.3 Concurrent prompts

`architecture.md` §11.2: prompts on the same session are serialized
server-side. If the agent advertises `_meta.claudeCode.promptQueueing`, we
forward both transparently. The frontend cannot tell the difference; the
RPC returns once the agent accepts the prompt either way.

v0 is single-client by usage pattern, so concurrency is unlikely in
practice; the policy is documented for completeness.

---

## §3. Errors

Typed error union. Each branch is JSON-tagged on `_tag` per `@effect/rpc`
conventions. The frontend matches on `_tag` to decide UI behavior.

### §3.1 `workspaces.create` errors

| `_tag` | When | Recovery |
|---|---|---|
| `WorkspacePathInvalid` | Path is not absolute, not a directory, or contains symlink loops. | Pick a different path. |
| `WorkspacePathNotFound` | Path does not exist on the server filesystem. | Create the directory or pick another. |
| `WorkspacePathConflict` | Another active workspace already has this path. | Use the existing one or delete first. |

### §3.2 `sessions.sendPrompt` errors

| `_tag` | When | Recovery |
|---|---|---|
| `WorkspaceNotFound` | `target.kind="new"` and `config.workspaceId` is unknown or soft-deleted. | Create or pick a different workspace. |
| `SessionNotFound` | `target.kind="existing"` and `sessionId` is unknown or soft-deleted. | Use a valid `sessionId` or start a new session. |
| `WorkspaceNotGit` | `worktreeMode.kind="worktree"` but the workspace is not a git repo. | Use `worktreeMode.kind="local"`. |
| `WorktreeCreateFailed` | `git worktree add` failed (dirty index, branch collision, etc.). | Surface the git stderr to the user; let them resolve manually. |
| `AgentSpawnFailed` | Could not spawn the configured agent binary (not on PATH, exec error). | Check the agent kind and the binary path in `~/.sandcastle/config.json`. |
| `AgentInitFailed` | ACP `initialize` errored. | Usually a version mismatch; surface the error message verbatim. |
| `AuthRequired` | Agent reported it needs authentication. v0 has no flow to drive it. | Authenticate locally and retry. Carries no payload in v0; richer flow lands with the auth slice. |
| `AgentRejectedPrompt` | ACP `session/prompt` returned an error (rare; usually validation). | Surface the error message; let the user edit the prompt. |
| `CapabilityNotSupported` | Reserved for future fields (e.g. an audio block on a text-only agent). Not emitted in v0. | n/a |

All `sessions.sendPrompt` errors leave **zero** server-side state behind on
`target: "new"` (full rollback). On `target: "existing"`, a failed prompt
marks its turn as `failed` but the session itself is preserved.

---

## §4. Design notes (why this shape)

### §4.1 No `sessions.create`

Architectural: sessions are lazy (`architecture.md` §5.2, §1.3 v1 scope).
There is no useful intermediate state between "the user is configuring a
session in the compose UI" and "the user has sent their first message" —
the first prompt is what materializes the session. Splitting them into two
RPCs would either:

- create a half-formed session row that we'd then have to garbage-collect
  if the user never sends a prompt, or
- require a "draft" status column and surrounding lifecycle code.

Both are worse than the transactional first-prompt operation.

### §4.2 `target` is a discriminated union, not separate methods

We could have two methods (`sessions.startNew`, `sessions.sendPrompt`).
We don't, because:

- The transactional semantics on `kind: "new"` are *the same kind* of
  operation as on `kind: "existing"`: produce a `turn`, attach the agent,
  return `{ sessionId, turnId }`. A single method matches the semantics.
- The frontend's compose UI can switch which path it submits without
  changing the RPC client wiring.
- Adding `target: "fork"` later (when `session/fork` graduates from
  unstable) is additive on the same method.

### §4.3 Why `modelSelection` is omitted from v0

Defaults live in `~/.sandcastle/config.json` (`agents.<kind>.defaultModel`,
`architecture.md` §6.7). The server applies them. Adding
`modelSelection: ModelSelection` to `NewSessionConfig` later is
non-breaking — any unset field is a default. The compose UI (also v0+)
only needs the picker once we wire `server.getCapabilities` to enumerate
available models.

### §4.4 Why `workspaceId` lives in `NewSessionConfig`, not at the top level

It only matters when `target.kind === "new"`. Putting it at the top level
would force the frontend to pass an irrelevant value (or `null`) on every
subsequent prompt. Nested under `config`, it appears exactly when needed.

### §4.5 What the RPC return tells you

`{ sessionId, turnId }` is intentionally minimal:

- `sessionId` lets the caller subscribe and refer to the session in future
  RPCs. On `target: "new"` this is the only place the new id is surfaced.
- `turnId` lets the caller correlate `turn-completed` / `turn-failed`
  ServerEvents on the subscribe stream once that lands.

Everything else (the agent's response content, capabilities, mode list,
model list) flows on the subscribe stream as a `snapshot` followed by live
events. The send-prompt RPC stays small.

### §4.6 v0 is observable in SQLite, not the UI

Without `sessions.subscribe`, the only way to see the agent's output is to
inspect the database directly:

```sql
SELECT server_seq, kind, payload
FROM events
WHERE session_id = ?
ORDER BY server_seq;
```

This is fine for bring-up and is the natural test surface anyway.
Subscribe ships next and lights up the UI without touching this contract.

---

## §5. Summary table

| RPC | Purpose | Returns |
|---|---|---|
| `workspaces.create({ label, path })` | Register a directory as a workspace. | `Workspace` |
| `sessions.sendPrompt({ target: { kind:"new", config }, content })` | Create a session + send its first prompt (one transaction). | `{ sessionId, turnId }` |
| `sessions.sendPrompt({ target: { kind:"existing", sessionId }, content })` | Send another prompt to an existing session. | `{ sessionId, turnId }` |
