# Sandcastle DB Layer

> **Status:** v1 design. Locked. Companion to `architecture.md` (especially §6),
> `rpc-contract.md`, and `acp.md`. This is the canonical reference for the
> SQLite schema, write path, and read path. The schema sketch in
> `architecture.md` §6.2 is a sketch; the spec lives here.

---

## §0. Scope

- All persistent state for one Sandcastle server lives in a single SQLite
  database at `~/.sandcastle/sandcastle.db`.
- Workspaces, sessions, turns, the per-session event log, two narrow
  projections (tool calls, plans), blobs metadata, and pending agent-issued
  requests are the v1 entities.
- Long tool output, blob bytes, MCP server state, and worktree files are
  **not** in the DB. They live on disk (§8).
- The DB is plaintext on disk. Encryption-at-rest is a deferred swap to
  SQLCipher (`architecture.md` §17).

---

## §1. On-disk location and engine setup

```
~/.sandcastle/sandcastle.db
```

Driver: Bun's native `bun:sqlite`. No ORM. Queries are written by hand using
small per-table repo modules (`apps/server/src/db/repos/*`, see
`directories.md` §4).

Pragmas applied at startup:

```sql
PRAGMA journal_mode      = WAL;        -- concurrent reader + single writer
PRAGMA foreign_keys      = ON;         -- enforce ON DELETE CASCADE
PRAGMA synchronous       = NORMAL;     -- WAL safe; faster than FULL
PRAGMA busy_timeout      = 5000;       -- 5s, to ride out short contention
PRAGMA wal_autocheckpoint = 1000;      -- pages
```

WAL is required: subscribers reading the events table do not block the writer
that's appending events for the active turn.

---

## §2. Design model: events as spine, projections as accelerators

The architectural commitment (`architecture.md` §2.5): the subscribe stream is
the spine. The DB mirrors that.

- **The `events` table is the source of truth.** Append-only. Every
  ACP `SessionUpdate` (post-normalization) and every `ServerEvent` is one row,
  with a per-session monotonic `server_seq`. The full session history can be
  reconstructed by scanning `events` for a `session_id` in `server_seq` order.
- **`tool_calls` and `plans` are projections.** They are written in the same
  SQLite transaction as the event that produced them. They exist only to make
  specific reads fast (long-output retrieval, nested-tool lookup, "current
  plan" widget). They are **not** consulted to build the subscribe-stream
  snapshot — `events` is sufficient by itself. If a projection ever drifts, it
  can be rebuilt by replaying events.
- **Other tables (`workspaces`, `sessions`, `turns`, `blobs`,
  `pending_requests`)** are normal first-class state — there's nothing to
  derive them from.

The cardinal invariant (`architecture.md` §6.4): inserting an event row,
bumping `sessions.last_server_seq`, and applying projection upserts all happen
in **one** SQLite transaction. Subscribers do not see `serverSeq = K` until
that transaction commits.

We hold this line because it lets two important properties be true at once:

1. The event log is the canonical answer for "what did the agent do?" — no
   bespoke reconstruction logic from projections required for the renderer.
2. The two reads we know we want fast (long-output retrieval, nested-tool
   tree) are O(indexed lookup) instead of O(JSON-scan).

---

## §3. Schema overview

```
workspaces ─┬─ workspace_mcp_overrides
            └─ sessions ─┬─ turns ─┬─ events                (spine)
                         │         ├─ tool_calls            (projection)
                         │         └─ plans                 (projection)
                         └─ pending_requests
blobs         (independent; referenced by hash from event payloads)
```

All `ON DELETE CASCADE` follows the parent edge: deleting a workspace cascades
sessions, which cascade turns, events, projections, and pending requests.
Soft delete is the default at the workspace and session level (a `deleted_at`
column); hard delete is reserved for purge tooling we haven't built.

---

## §4. Tables

### §4.1 `workspaces`

```sql
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,                    -- WorkspaceId (uuid, branded)
  label       TEXT NOT NULL,                       -- user-facing display name
  path        TEXT NOT NULL,                       -- absolute server-side path
  is_git      INTEGER NOT NULL,                    -- bool: probed at create
  created_at  TEXT NOT NULL,                       -- ISO-8601
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT                                  -- soft delete
);
CREATE INDEX        workspaces_active      ON workspaces(deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX workspaces_active_path ON workspaces(path)       WHERE deleted_at IS NULL;
```

Lifecycle: written by `workspaces.create`; soft-deleted by `workspaces.delete`
(cascades to all child sessions). `path` is canonical and immutable. The
`is_git` flag is set once at creation; if the directory becomes / ceases to be
a git repo later, we don't auto-re-detect (out of scope for v1).

### §4.2 `workspace_mcp_overrides`

```sql
CREATE TABLE workspace_mcp_overrides (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  config_json  TEXT NOT NULL,                      -- normalized McpServer[]
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (workspace_id)
);
```

One row per workspace at most. The merged set of (global MCP from
`config.json`) ∪ (workspace overrides) is what the relay forwards to
`session/new` (`acp.md` §13). Editing UI is deferred; hand-edit allowed via a
future RPC.

### §4.3 `sessions`

```sql
CREATE TABLE sessions (
  id                       TEXT PRIMARY KEY,                            -- SessionId
  workspace_id             TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_kind               TEXT NOT NULL,                               -- 'claude' | 'gemini' | …
  model_selection_json     TEXT NOT NULL,                               -- ACP ModelSelection
  worktree_mode_json       TEXT NOT NULL,                               -- {kind:'local'} | {kind:'worktree',baseBranch,worktreeBranch}
  workdir                  TEXT NOT NULL,                               -- resolved at creation; immutable
  branch                   TEXT,                                        -- current branch in workdir; nullable
  title                    TEXT NOT NULL,                               -- placeholder until title-gen runs
  capabilities_json        TEXT,                                        -- last-seen NormalizedCapabilities; null until first bind
  current_acp_session_id   TEXT,                                        -- nullable; debug/diagnostic only
  last_server_seq          INTEGER NOT NULL DEFAULT 0,                  -- monotonic per-session
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT                                         -- soft delete
);
CREATE INDEX sessions_by_workspace ON sessions(workspace_id);
CREATE INDEX sessions_active        ON sessions(deleted_at) WHERE deleted_at IS NULL;
```

Lifecycle: inserted only inside the first-prompt transaction
(`architecture.md` §10.1). `worktree_mode_json` and `workdir` are immutable
after creation; everything else may be updated.

`last_server_seq` is the high-water mark for the session's events. Every
event-insert transaction bumps it (§5); subscribers reconnecting use it as the
source for "what's the latest seq this session has?".

`current_acp_session_id` is the agent-issued ACP session ID. We store it for
diagnostics and for the `session/load` path (`acp.md` §6.1) on respawn. It
is **server-internal**; it never leaves the WS boundary (`architecture.md`
§9.4).

### §4.4 `turns`

```sql
CREATE TABLE turns (
  id          TEXT PRIMARY KEY,                                    -- TurnId
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  status      TEXT NOT NULL CHECK (status IN ('running','completed','cancelled','failed')),
  stop_reason TEXT                                                  -- ACP StopReason; null until completed
);
CREATE INDEX turns_by_session ON turns(session_id, started_at);
```

A turn = one user prompt + the agent's response cycle (`architecture.md`
§5.3). Inserted at `turn-started`; updated in place at terminal status. There
is exactly one running turn per session at any moment (concurrency policy:
`architecture.md` §11.2).

`turns` is small and frequently joined; the index on `(session_id,
started_at)` covers the only common access pattern ("turns for this session,
in order").

### §4.5 `tool_calls` (projection)

```sql
CREATE TABLE tool_calls (
  session_id           TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tool_call_id         TEXT NOT NULL,                            -- agent-issued ToolCallId
  turn_id              TEXT NOT NULL REFERENCES turns(id)   ON DELETE CASCADE,
  parent_tool_call_id  TEXT,                                     -- nullable; lifted from _meta.claudeCode.parentToolUseId
  kind                 TEXT,                                     -- ACP ToolKind
  status               TEXT NOT NULL,                            -- pending|in_progress|completed|failed
  title                TEXT NOT NULL,
  latest_state_json    TEXT NOT NULL,                            -- full merged ToolCall (post-normalization)
  full_output_path     TEXT,                                     -- nullable; absolute path on server fs
  started_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (session_id, tool_call_id)
);
CREATE INDEX tool_calls_by_turn   ON tool_calls(session_id, turn_id);
CREATE INDEX tool_calls_by_parent ON tool_calls(session_id, parent_tool_call_id) WHERE parent_tool_call_id IS NOT NULL;
```

**Why this projection exists.** Two reads:

1. **`sessions.fetchToolOutput`** (`architecture.md` §10.7,
   `rpc-contract.md` §0.1 deferred) needs `(session_id, tool_call_id) →
   {status, full_output_path}` in O(index lookup). Without this projection
   we'd JSON-scan events.
2. **Nested rendering** of sub-agent tool-call trees benefits from a parent
   index. The renderer also gets `parentToolCallId` lifted onto the
   `SessionUpdate` (`acp.md` §3.4), so it doesn't *strictly* need the DB to
   render — but the index is useful for any "find children of X" query the
   server runs internally.

**Write rule.** On every `tool_call` and `tool_call_update` SessionUpdate,
inside the same transaction as the events insert:

```
INSERT INTO tool_calls (..., latest_state_json = <merged>, status = ..., updated_at = now())
ON CONFLICT (session_id, tool_call_id) DO UPDATE SET
  latest_state_json = excluded.latest_state_json,
  status            = excluded.status,
  kind              = COALESCE(excluded.kind, tool_calls.kind),
  title             = COALESCE(excluded.title, tool_calls.title),
  parent_tool_call_id = COALESCE(excluded.parent_tool_call_id, tool_calls.parent_tool_call_id),
  full_output_path  = COALESCE(excluded.full_output_path, tool_calls.full_output_path),
  updated_at        = excluded.updated_at;
```

Merge semantics match `acp.md` §9.3: status advances `pending → in_progress →
completed|failed`; new fields are picked up; absent fields preserve.
`latest_state_json` is the full merged `ToolCall` shape — consumers can ship
it directly as the payload of a synthesized `tool_call` SessionUpdate if they
ever need to (e.g. for an out-of-band "show me this tool call alone" view).

The projection is **not** consulted to build the snapshot history; the events
table already contains the `tool_call`/`tool_call_update` SessionUpdates and
the renderer folds them itself.

### §4.6 `plans` (projection)

```sql
CREATE TABLE plans (
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id           TEXT NOT NULL REFERENCES turns(id)   ON DELETE CASCADE,
  latest_plan_json  TEXT NOT NULL,                          -- full ACP Plan
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_id)
);
```

ACP plans are full snapshots — the agent re-emits the entire plan on every
change (`acp.md` §14). One row per `(session, turn)`; later plan emissions in
the same turn upsert. We keep only the latest. If we ever need plan history,
it's reconstructable from the events table (every `plan` SessionUpdate is
there).

The projection is for the renderer's "current plan" widget that wants the
latest plan for a turn without scanning events for that turn.

### §4.7 `events` (the spine)

```sql
CREATE TABLE events (
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  server_seq  INTEGER NOT NULL,                                       -- monotonic per session
  kind        TEXT NOT NULL CHECK (kind IN ('agent','server')),
  payload     TEXT NOT NULL,                                          -- JSON
  turn_id     TEXT REFERENCES turns(id) ON DELETE CASCADE,            -- nullable: some ServerEvents are turn-less
  received_at TEXT NOT NULL,
  PRIMARY KEY (session_id, server_seq)
);
CREATE INDEX events_by_turn ON events(session_id, turn_id) WHERE turn_id IS NOT NULL;
```

The append-only log that the subscribe stream serves. Two row kinds:

| `kind`     | `payload` shape                                    | Source |
|------------|----------------------------------------------------|--------|
| `'agent'`  | normalized `SessionUpdate` (`_meta` lifted/dropped)| ACP `session/update` notifications |
| `'server'` | `ServerEvent`                                      | Server-injected (turn lifecycle, permissions, auth, etc.) |

**`turn_id` is denormalized onto each event** so we can answer "events for
turn K" in one indexed scan — useful for:
- UI features like "fold this turn entirely" (the user-driven motivation).
- Future checkpoint restore (slice events at the chosen turn boundary).
- Per-turn diagnostics.

Some `ServerEvent`s aren't tied to a turn (e.g. `capabilities-changed`,
`workspace-relocation-required`, `auth-required` issued ahead of any turn).
For those, `turn_id` is NULL. The partial index excludes NULLs to keep it
small.

**No payload editing.** Once a row is inserted with a given `server_seq`, its
contents are immutable. Streaming text chunks become one row per chunk
(approach (i) from the design discussion); coalescing is *not* done at write
time. If row volume becomes a problem we can revisit, but in v1 we trade rows
for simplicity.

**`server_seq` is per session, not global.** Two sessions can both have
`server_seq = 7`. Composite primary key `(session_id, server_seq)` enforces
this. Assignment is `MAX(server_seq) + 1` for the session, computed inside
the same transaction that inserts the row (cheap given the index).

### §4.8 `blobs`

```sql
CREATE TABLE blobs (
  hash       TEXT PRIMARY KEY,                                       -- sha256 hex
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

Metadata only. Bytes live on disk at `~/.sandcastle/blobs/{first2}/{hash}`
(`architecture.md` §6.1). Insertion is idempotent on the hash; identical
content from two sessions shares one row and one file.

Referenced from event payloads via ACP `ImageContent.uri` of the form
`https://relay/blobs/{hash}` after the normalizer's image-rewrite step
(`architecture.md` §12). The DB has no FK from `events.payload` to `blobs`;
the relationship is implicit.

GC: there is no GC in v1. If a session is hard-deleted in the future, blobs
referenced only by it become orphans until a future sweep tool runs.

### §4.9 `pending_requests`

```sql
CREATE TABLE pending_requests (
  request_id  TEXT PRIMARY KEY,                                       -- PermissionRequestId | ElicitationRequestId
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('permission','elicitation')),
  payload     TEXT NOT NULL,                                          -- ACP request payload
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  resolved_at TEXT,
  outcome     TEXT                                                    -- ACP-shaped outcome JSON; null until resolved
);
CREATE INDEX pending_requests_unresolved ON pending_requests(session_id, expires_at) WHERE resolved_at IS NULL;
```

v1 architecture persists the routing state for permission and elicitation
requests; UI is deferred (`architecture.md` §10.5). Auto-deny on `expires_at`
fires from a periodic sweep; the sweep marks `resolved_at` and writes the
outcome.

The unresolved-only partial index is what the sweep scans.

---

## §5. Write path

The single publish-point (`architecture.md` §8.4) lives at
`apps/server/src/sessions/publish.ts`. For each event to publish:

1. Begin SQLite transaction.
2. `SELECT last_server_seq FROM sessions WHERE id = ?` (no lock needed; we
   serialize publishes per session in-memory).
3. Compute `next_seq = last_server_seq + 1`.
4. `INSERT INTO events (session_id, server_seq, kind, payload, turn_id, received_at)`.
5. `UPDATE sessions SET last_server_seq = ?, updated_at = ? WHERE id = ?`.
6. **Projection upserts** depending on payload (only for `kind='agent'`):
   - `tool_call` / `tool_call_update` SessionUpdate → upsert `tool_calls`.
   - `plan` SessionUpdate → upsert `plans` keyed by `(session_id, turn_id)`.
   - All other variants: no projection write.
7. Commit.
8. Push onto in-memory ring buffer.
9. Iterate per-session subscriber set; write to each.

If commit fails, no subscriber sees the event and no projection drifts.
If a subscriber's outbound queue fills (step 9), that subscription is killed
with a typed error — the client reconnects with `sinceSeq` and the events are
replayed (`architecture.md` §8.4). The DB is unaffected.

**Publishes are serialized per session** (a per-session async lock in
`publish.ts`). Cross-session publishes are independent and SQLite's WAL lets
them interleave freely.

**First-prompt transaction.** The first-prompt flow (`architecture.md` §10.1)
is a *larger* transaction that wraps multiple side-effects (worktree creation,
agent spawn, ACP handshakes, then the first event publish). The publish
inside it follows the same shape as above. If any step fails, the entire
transaction rolls back and no rows are left behind.

---

## §6. Read path

### §6.1 Snapshot (subscribe without `sinceSeq`)

```
SELECT * FROM sessions       WHERE id = ?
SELECT * FROM turns          WHERE session_id = ? ORDER BY started_at
SELECT payload, kind FROM events WHERE session_id = ? ORDER BY server_seq
SELECT * FROM pending_requests WHERE session_id = ? AND resolved_at IS NULL
```

The `events` rows are JSON-decoded and split by `kind` into the snapshot's
`history: SessionUpdate[]` (the `agent` ones) and a small set of relevant
`server` events that materially shape state (e.g. `agent-respawned`,
`session-meta-updated`). The renderer folds the `SessionUpdate[]` exactly as
it folds the live tail.

**Projections are not read here.** `tool_calls` and `plans` exist only for
the targeted reads in §6.3 / §6.4. The snapshot path is identical to what
you'd get with no projections at all — that's deliberate: the projections
must never be load-bearing for correctness.

### §6.2 Replay (subscribe with `sinceSeq = K`)

```
SELECT payload, kind, server_seq FROM events
WHERE session_id = ? AND server_seq > ?
ORDER BY server_seq
```

Served from the ring buffer if recent enough (`architecture.md` §6.5),
otherwise from this query. If the request is older than what we can fulfill
(unlikely in v1 since we don't prune events), the server falls back to a
snapshot.

### §6.3 `sessions.fetchToolOutput`

```
SELECT full_output_path, status FROM tool_calls
WHERE session_id = ? AND tool_call_id = ?
```

If `full_output_path` is non-null, the server reads the file (optionally a
range) and returns a `ToolOutputChunk`.

### §6.4 Current plan for a turn

```
SELECT latest_plan_json FROM plans
WHERE session_id = ? AND turn_id = ?
```

Used by any UI surface that wants "the plan for this turn" without
materializing the full event stream.

### §6.5 List views

`workspaces.list` and `sessions.list` are answered straight from
`workspaces` and `sessions`. No event scanning. Title (eventually generated
post-completion via `session-meta-updated`) is stored on the session row;
list rows have everything the UI needs for the sidebar.

---

## §7. Migrations

Raw SQL files at `apps/server/migrations/NNN_description.sql`, applied in
filename order by an in-house runner at `apps/server/src/db/migrations.ts`
(`directories.md` §6 referenced as §6.3 / §14).

Bookkeeping table:

```sql
CREATE TABLE _migrations (
  version    INTEGER PRIMARY KEY,                  -- the NNN
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum   TEXT NOT NULL                         -- sha256 of the .sql file at apply time
);
```

Runner behavior on startup (`architecture.md` §14.2):

1. Open the DB; create `_migrations` if absent.
2. Read all files in `migrations/` matching `^\d{3}_.+\.sql$`.
3. For each file with version > MAX(applied), apply in a transaction; on
   success record `(version, name, now, checksum)`.
4. For each already-applied version, verify the checksum matches; if not, log
   a loud warning. We don't refuse to start in v1 — devs editing migrations
   in development is expected — but the warning is a smell.

We do not support down-migrations. Schema mistakes are fixed forward.

`001_init.sql` contains every table in §4 plus indexes. Future migrations are
purely additive (new tables, new columns with `DEFAULT`, new indexes).

---

## §8. What's NOT in the DB

Deliberately stored elsewhere:

| Data | Location | Rationale |
|---|---|---|
| Blob bytes | `~/.sandcastle/blobs/{first2}/{hash}` | Content-addressed, served via HTTP, large. |
| Long tool output | A file on the server filesystem; path stored in `tool_calls.full_output_path` | Often megabytes; SQLite is the wrong tool. |
| Worktree contents | `~/.sandcastle/worktrees/{workspaceId}/{sessionId}` | Managed by `git worktree`. The DB knows the path on the session row only via `workdir`. |
| Global config (MCP, listen, agents) | `~/.sandcastle/config.json` | User-editable; reload on SIGHUP (`architecture.md` §6.7). |
| Agent process state, capabilities cache | In-memory only; the session row stores last-seen `capabilities_json` for cold reads | Process state dies with the process; on respawn we re-`initialize`. |
| Ring-buffer events | In-memory only | Rebuilt from SQLite on session rebind (`architecture.md` §6.5). |
| Auth state per agent kind | TBD; not in v1 schema | Single-user; we can add a `auth_state` table when the auth flow ships (`architecture.md` §10.6). |

---

## §9. Cross-references

| Topic | Where |
|---|---|
| Wire-level event envelope (`StreamItem`) | `architecture.md` §8.1 |
| Subscribe semantics (`sinceSeq`, snapshot) | `architecture.md` §8.2 |
| First-prompt transaction (the big write) | `architecture.md` §10.1 |
| Per-agent normalizer (writes go through it) | `acp.md` §3.4, `apps/server/src/agents/normalizers/*` |
| Tool-call merge semantics | `acp.md` §9.3 |
| Plan emission semantics (full snapshot per emission) | `acp.md` §14 |
| `ServerEvent` discriminator | `architecture.md` §8.6 |
| Long tool output retrieval | `architecture.md` §10.7 |
| Image blob URI rewrite | `architecture.md` §12 |
| Repo paths for repos / migrations | `directories.md` §4 |

---

## §10. Glossary

- **Spine** — the `events` table. The single source of truth for everything
  that happened in a session.
- **Projection** — a derived table written in the same transaction as the
  events it projects from, kept solely to make a specific read fast. Never
  load-bearing for correctness.
- **`server_seq`** — per-session monotonic 64-bit counter assigned at event
  insert time. Survives process restarts via `sessions.last_server_seq`.
- **Publish-point** — the single function that inserts an event row, updates
  projections, bumps the seq counter, and fans out to subscribers — all in
  one SQLite transaction.
- **Soft delete** — `deleted_at` timestamp on `workspaces` and `sessions`.
  Hard delete is reserved for future purge tooling.
