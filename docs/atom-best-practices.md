# `@effect/atom` best practices (local-first / sync-engine)

A practical guide to using the Effect `Atom` reactivity library well for a
local-first desktop app that should *feel instant*: preload on startup, keep
state local, mutate optimistically, sync to the server in the background, and
roll back cleanly on error.

This is written against `effect@4.0.0-beta.78` / `@effect/atom-react@4.0.0-beta.78`
(the `Atom` module now lives inside core `effect`, under
`effect/unstable/reactivity`). It is grounded in the source at
`effect-smol/packages/effect/src/unstable/reactivity/*` and the React bindings
at `effect-smol/packages/atom/react/*`. It also references our existing setup in
`apps/desktop/src/renderer/src/rpc/*` and `lib/prefetch.ts`.

> **API stability note:** this is `unstable/reactivity` and a `4.0.0-beta`. Names
> can move between betas. Everything below is verified against beta.78 — re-check
> after a bump.

---

## TL;DR — should we use react-query, or just Atom?

**Just Atom. Do not add react-query.** `@effect/atom` already ships every
"goodie" you listed, and it ships them *natively integrated with Effect and our
`AtomRpc` client* — so adding react-query would mean running two competing
caches over the same server state, with two invalidation models, two loading-state
shapes, and a serialization boundary between Effect values and react-query's
plain promises. That fragmentation is exactly what kills the "single source of
truth, feels instant" goal.

| react-query feature | Atom equivalent | Status |
|---|---|---|
| `staleTime` / stale-while-revalidate | `Atom.swr({ staleTime })` + `AsyncResult.waiting` overlay | ✅ built-in |
| `cacheTime` / `gcTime` | registry `defaultIdleTTL`, per-atom `Atom.setIdleTTL`, `Atom.keepAlive` | ✅ built-in |
| `queryKey` + `invalidateQueries` | `reactivityKeys` + `Reactivity.mutation` / `Atom.withReactivity` | ✅ built-in |
| `refetchInterval` | `Atom.withRefresh(duration)` | ✅ built-in |
| `refetchOnWindowFocus` | `Atom.refreshOnWindowFocus` / `swr({ revalidateOnFocus })` | ✅ built-in |
| optimistic updates + rollback | `Atom.optimistic` + `Atom.optimisticFn` (auto rollback on failure) | ✅ built-in |
| `setQueryData` (manual cache write) | writable atoms, `registry.set/update`, `AtomRef` | ✅ built-in |
| hydration / SSR / persistence | `Hydration.dehydrate/hydrate`, `HydrationBoundary`, `Atom.kvs`, `Atom.serializable` | ✅ built-in |
| infinite / paginated queries | `Atom.pull` (write to pull next page, accumulates) | ✅ built-in |
| devtools | — | ❌ no equivalent (use `Atom.withLabel` + `registry.getNodes()`) |
| huge ecosystem / Stack Overflow answers | — | ⚠️ much smaller, beta |

The two things react-query genuinely has more of are **devtools** and
**ecosystem maturity**. Neither outweighs running a split-brain cache. We are
already all-in on Effect + `AtomRpc`; stay there.

**One honest caveat (read the [Sync-engine architecture](#sync-engine-architecture)
section):** Atom is a *reactive cache + optimistic layer*, not a turnkey sync
engine. It does not give you an offline mutation queue, durable outbox, or
conflict resolution. react-query doesn't either. If you want true offline-first
with a replayable mutation log, you build that orchestration yourself (as Effect
services) — Atom provides the reactive surface, optimism, and persistence
primitives to build it on. If "local-first" really means "warm cache + optimistic
writes against a server that's usually reachable," Atom alone covers you today.

---

## Mental model (read this first)

Three layers, keep them straight:

1. **`Atom`** — a *recipe* for a value. It is just an immutable descriptor
   (`Atom.make(...)`, `Atom.fn(...)`, etc.). Creating an atom runs nothing.
2. **`AtomRegistry`** — the *store*. It holds the live value of each atom,
   tracks the dependency graph, runs effects, manages subscriptions, and
   garbage-collects unobserved atoms. **Caching and lifetime live here, not on
   the atom.** We own a single registry as a module singleton in
   `rpc/registry.ts`.
3. **`AsyncResult<A, E>`** — the *value* an effectful atom produces. It's the
   loading/error/success state machine, and it's the key to stale-while-revalidate.

An atom's value is only *live* while the registry has a reason to keep it:
a subscriber (React component via a hook), an explicit `registry.mount(atom)`,
a non-lazy dependent, or `keepAlive`. Remove all of those and a plain atom is
disposed (and re-runs from scratch next time it's read) — unless a TTL or
`keepAlive` says otherwise. This is the whole caching story; everything below
is a refinement of it.

### `AsyncResult` — the state machine

```ts
type AsyncResult<A, E> = Initial<A, E> | Success<A, E> | Failure<A, E>
```

- `Initial` — never resolved; no value, no error.
- `Success` — has `value: A` and a `timestamp: number`.
- `Failure` — has `cause` **and** `previousSuccess: Option<Success<A, E>>` —
  the last good value is *retained on failure*.
- **`waiting: boolean`** — an *overlay on every variant*, not a fourth state.
  `waiting === true` means "a (re)computation is in flight." This is what makes
  SWR work: a `Success` can be `waiting: true` while it refreshes in the
  background.

Reading the value the right way:

```ts
import { AsyncResult } from "effect/unstable/reactivity"

AsyncResult.value(result)        // Option<A> — current success OR a failure's previousSuccess
AsyncResult.getOrElse(result, () => fallback)
AsyncResult.isSuccess(result)    // true success right now
AsyncResult.isFailure(result)
AsyncResult.isInitial(result)
AsyncResult.isWaiting(result)    // === result.waiting
AsyncResult.error(result)        // Option<E>
```

⚠️ **Gotcha:** `value`/`getOrElse` read *through* a failure to its
`previousSuccess`. So "I got a value" ≠ "the last fetch succeeded." If you must
distinguish stale-data-behind-an-error from a fresh success, check `isFailure` /
`error` explicitly.

Pattern-matching in UI:

```ts
AsyncResult.match(result, {
  onInitial: () => <Spinner />,
  onFailure: (f) => <Error cause={f.cause} />,
  onSuccess: (s) => <Data value={s.value} />,
})

// Waiting-aware: onWaiting fires first for any waiting result AND for Initial
AsyncResult.matchWithWaiting(result, {
  onWaiting: (r) => /* show stale AsyncResult.value(r) with a subtle spinner */,
  onError:   (e) => ...,
  onDefect:  (d) => ...,
  onSuccess: (s) => ...,
})
```

---

## 1. Caching

Caching is a property of the **registry node**, controlled by three knobs.

### The GC rule

A node is eligible for disposal when **all** of: the atom is *not* `keepAlive`,
it has **no listeners**, and it has **no dependent children**. On the next async
tick after it becomes eligible:

- **no TTL** → disposed promptly.
- **has a TTL** (`idleTTL` on the atom, or registry `defaultIdleTTL`) → kept for
  `idleTTL` ms, then swept. **Re-reading within the window cancels the sweep**
  (keeps it warm).
- **`keepAlive`** → never auto-disposed.

Disposal means: finalizers run, effects/streams stop, and the next read rebuilds
from `Initial`.

### The three knobs

```ts
// Registry-wide default (ours is 400ms — see rpc/registry.ts)
AtomRegistry.make({ defaultIdleTTL: 400 })

// Per-atom idle TTL. Finite => dispose after idle; Infinity => keepAlive; 0 => dispose immediately when idle
myAtom.pipe(Atom.setIdleTTL("5 minutes"))
myAtom.pipe(Atom.setIdleTTL(0))          // evict the instant it's unobserved

// Pin forever (survives no-subscribers). Opt out again with Atom.autoDispose
myAtom.pipe(Atom.keepAlive)
```

### How we use it (and why)

Our server-state queries set `timeToLive: Duration.infinity`, which `AtomRpc`
maps to `Atom.keepAlive`. Combined with the registry's `defaultIdleTTL: 400`,
the effect is:

- A bare component-only atom: disposed ~400ms after the last component unmounts —
  navigating away and back re-fetches and flashes a loader.
- A `keepAlive` query atom: the last `Success` stays resident for the whole
  session. Navigating away and back is instant; a refresh shows the stale value
  while revalidating.

That's exactly why `rpc/queries.ts` pins the project/workspace queries with
`Duration.infinity`. **Rule of thumb:**

- **Session-resident server state read across routes** → `keepAlive` (i.e.
  `timeToLive: Duration.infinity`). This is most of our reads.
- **Expensive-but-recreatable derived data** → finite `setIdleTTL` so it
  survives quick re-mounts but doesn't leak forever.
- **Per-screen ephemeral state** → leave it on `defaultIdleTTL` (auto-dispose).

> **Identity is part of caching.** `AtomRpc.query(...)` / `Atom.family(...)` are
> memoized by *structural key* (tag + payload + reactivityKeys + timeToLive +
> serializationKey). Two call sites that build the call slightly differently get
> *different cache nodes* → double fetch, missed refreshes. This is why
> `rpc/queries.ts` centralizes every read behind one builder. Keep doing that.

---

## 2. Stale-while-revalidate

Two ways, and we already use the second.

### a) `Atom.swr` — the declarative combinator

```ts
const userAtom = Atom.make(fetchUser).pipe(
  Atom.swr({
    staleTime: "30 seconds",        // skip auto-revalidation while fresher than this
    revalidateOnMount: true,        // if stale, refresh on (re)mount
    revalidateOnFocus: true,        // true = revalidate-if-stale on focus; "always" = always
    // focusSignal: someAtom,       // custom focus trigger (defaults to window focus)
  }),
)
```

Behavior: reads within `staleTime` return the cached value and **don't** trigger
a refetch. Once stale, the next read kicks off a background refresh — the atom
keeps returning the **previous value with `waiting: true`** until the new value
lands. Manual `Atom.refresh` always forces a refetch regardless of `staleTime`.

### b) Manual SWR via `keepAlive` + `refresh` (what `lib/prefetch.ts` does)

Because `AsyncResult` carries the previous value across a refresh
(`waitingFrom(previous)`), `keepAlive` + an explicit `registry.refresh(atom)`
*is* stale-while-revalidate — the on-screen `Success` flips to `waiting: true`
carrying the stale value, nothing blanks, and the fresh value swaps in when it
arrives. Our prefetcher uses this directly for window-focus revalidation:

```ts
// lib/prefetch.ts (paraphrased)
for (const atom of tracked) appRegistry.refresh(atom) // keepAlive keeps stale value on screen
```

### Rendering SWR in React

The default `useAtomSuspense` is SWR-friendly: `suspendOnWaiting` defaults to
**false**, so it suspends only on the *first* load (`Initial`) and does **not**
re-suspend during background refreshes — the resolved value keeps rendering.

```ts
// Suspends once on initial load; renders through refreshes
const user = useAtomSuspense(userAtom) // AsyncResult.Success<User>

// Or read the raw AsyncResult and show your own "refreshing" affordance:
const result = useAtomValue(userAtom)
const data = AsyncResult.value(result)         // Option<User>, present even while waiting
const refreshing = result.waiting
```

Set `suspendOnWaiting: true` only if you *want* the loader back on every refresh
(usually you don't, for a local-first feel).

---

## 3. Invalidate cache

Two complementary mechanisms.

### a) Direct refresh (imperative, single atom)

```ts
Atom.refresh(myAtom)               // Effect<void, never, AtomRegistry>
registry.refresh(myAtom)           // imperative, off a registry handle
const refresh = useAtomRefresh(myAtom) // () => void, in a component
```

We use `registry.refresh` from non-React code (the MCP bridge, the focus
revalidation sweep).

### b) Reactivity keys (declarative, query-key style) — preferred for mutations

This is the react-query `invalidateQueries` analogue and the backbone of our
sync model. Tag queries with keys; have mutations invalidate the same keys
**on success**.

```ts
// Query: declares what it depends on
Client.query("workspaces.list", { projectId }, {
  reactivityKeys: ["workspaces", projectId],
  timeToLive: Duration.infinity,
})

// Mutation: invalidates the same keys after it succeeds
Client.mutation("workspaces.create") // pass reactivityKeys when you set it:
registry.set(createWorkspace, { projectId, name, reactivityKeys: ["workspaces", projectId] })
```

Key shapes:

- **Flat array** `["workspaces", projectId]` — exact match.
- **Record** `{ workspaces: [projectId, otherId] }` — the property name is a
  *broad namespace*. Invalidating the namespace `["workspaces"]` reruns **every**
  query under it; invalidating `workspaces:<id>` targets one record. Use this for
  "refresh everything in this collection" vs "refresh this one row."

Semantics that matter:

- **Invalidation only fires on mutation success.** A failed server write does
  *not* refresh dependent queries (good — you don't want to clobber an optimistic
  rollback with a stale refetch). Source: `Reactivity.mutation = tap(effect, invalidate(keys))`.
- Prefer **stable, primitive key values** (strings/numbers). Object keys are
  hashed by structure and are easy to get subtly wrong.
- For a burst of writes, wrap them so invalidations coalesce
  (`Reactivity.withBatch` on the effect side, or `Atom.batch` on the set side).

### c) Signal-driven refresh (lightweight pub/sub)

```ts
const bumpSignal = Atom.make(0)
const atom = Atom.make(build).pipe(Atom.makeRefreshOnSignal(bumpSignal))
registry.set(bumpSignal, (n) => n + 1) // forces `atom` to rebuild
```

Good when reactivity keys are overkill and you just want "when X changes, redo Y."

---

## 4. Refetch on interval

```ts
// Re-run every 30s while the atom is mounted (interval/polling)
const liveStatus = Atom.make(fetchStatus).pipe(Atom.withRefresh("30 seconds"))

// On window focus (built-in)
const atom = Atom.make(fetchThing).pipe(Atom.refreshOnWindowFocus)
// equivalently swr({ revalidateOnFocus: true })
```

`withRefresh(d)` reschedules itself after each read and cancels on dispose, so it
only polls while something is observing it. For a desktop app, prefer
**focus/visibility revalidation** (which we already do in `prefetch.ts`) over
tight intervals — it's cheaper and matches when the user actually looks at data.
Reserve `withRefresh` for genuinely live data (e.g. a running task's status).

For **paginated / infinite** data, use `Atom.pull` instead of interval polling:

```ts
const feed = Atom.pull(streamOfPages)
registry.set(feed, void 0)   // pull the next page (items accumulate)
registry.refresh(feed)       // restart from the first page
// value: AsyncResult<{ done: boolean, items: NonEmptyArray<A> }>
```

`AtomRpc.query` on a **streaming** RPC returns one of these pull atoms
automatically.

---

## 5. Optimistic values + rollback

This is the centerpiece for "feels instant." `Atom.optimistic` + `Atom.optimisticFn`
give you optimistic apply **with automatic rollback on failure** and an
automatic authoritative refresh on success.

### The shape

```ts
import { Atom, AsyncResult } from "effect/unstable/reactivity"

// 1. A source atom (usually a server-state query)
const workspaceAtom = workspaceGetQuery(workspaceId) // Atom<AsyncResult<Workspace, E>>

// 2. Wrap it so it accepts optimistic transitions
const optimisticWorkspace = workspaceAtom.pipe(Atom.optimistic)

// 3. A mutation fn that applies the optimistic value, then runs the real write
const rename = optimisticWorkspace.pipe(
  Atom.optimisticFn({
    // compute the provisional value from (current, mutationInput)
    reducer: (current, name: string) => AsyncResult.success({ ...currentValue(current), name }),
    // the real server mutation (an AtomResultFn — e.g. Client.mutation(...))
    fn: Client.mutation("workspaces.rename"),
  }),
)

// 4. Fire it
registry.set(rename, "New name")
```

What happens, verified from the tests:

1. **Optimistic phase:** `optimisticWorkspace` immediately shows the reducer's
   value with `waiting: true`. The underlying source atom is untouched.
2. **Success:** the source atom is `refresh`ed (authoritative value pulled), and
   the optimistic overlay clears to that real value.
3. **Failure:** the optimistic value is **rolled back to the latest source
   value** automatically. The source atom is *not* rebuilt. (Pair with reactivity
   keys for the success-path refetch.)

### Intermediate updates (progress / server echoes)

Use the callback form to push interim optimistic states before the final commit:

```ts
Atom.optimisticFn({
  reducer: (_current, update: number) => AsyncResult.success(update),
  fn: (set) => Atom.fn(Effect.fnUntraced(function* () {
    set(AsyncResult.success(123))   // intermediate optimistic value (waiting: true)
    yield* doTheWork                 // ...then settle
  })),
})
```

### In React

```ts
// Fire-and-forget (renders optimistically via the atom's value):
const rename = useAtomSet(renameFn)
rename("New name")

// Await the settle (rejects on failure):
const rename = useAtomSet(renameFn, { mode: "promise" })
await rename("New name")

// Await as an Exit (never throws on a domain failure — inspect it):
const rename = useAtomSet(renameFn, { mode: "promiseExit" })
const exit = await rename("New name")
```

### Optimistic for collections (insert/remove in a list)

`Atom.optimistic` operates on one atom's value, so model list mutations as a
reducer over the list value: `reducer: (list, item) => AsyncResult.success([...listValue, item])`.
On success the reactivity-key invalidation refetches the authoritative list; on
failure it rolls back to the previous list. For purely-local lists with no
server, an `AtomRef.collection` (below) is simpler.

---

## 6. Other patterns worth knowing

### `Atom.batch` — atomic multi-write

```ts
Atom.batch(() => {
  registry.set(a, 1)
  registry.set(b, "x")
}) // derived atoms recompute once, subscribers notified once, after commit
```

Use when applying a batch of sync-engine changes so the UI doesn't flicker
through intermediate states.

### `Atom.debounce` — coalesce a fast-changing source

```ts
const debouncedQuery = searchInput.pipe(Atom.debounce("250 ms"))
```

For search-as-you-type, cursor position, draft text before persisting.

### `AtomRef` — local mutable state *outside* the registry

A small observable cell with a stable key and its own subscribers; no registry
needed. Equality-aware (no notify if `Equal.equals` the current value). Ideal for
form state, view models, and local-first collections.

```ts
import { AtomRef } from "effect/unstable/reactivity"

const draft = AtomRef.make({ title: "", body: "" })
const titleRef = draft.prop("title")        // writable focus on one field
draft.set({ title: "Hi", body: "" })
draft.update((d) => ({ ...d, body: "..." }))

const todos = AtomRef.collection<Todo>([])   // ordered list of item refs
todos.push(todo); todos.remove(ref)

// In React:
const value = useAtomRef(draft)
const title = useAtomRefPropValue(draft, "title")
```

⚠️ Mutating an object/array *in place* won't notify — always `set`/`update`/use a
prop ref.

### Persistence — `Atom.kvs` (localStorage / KeyValueStore)

```ts
const theme = Atom.kvs({
  runtime: kvsRuntime,           // Atom.runtime providing a KeyValueStore
  key: "theme",
  schema: Schema.Literal("light", "dark"),
  defaultValue: () => "dark",
  // mode: "async" to expose load as AsyncResult; default is sync
})
```

A writable atom backed by persistent storage. Good for durable local preferences
and for a local-first store that must survive reloads. `defaultValue` is memoized
and does **not** clobber existing storage during load.

### Hydration — preload at startup

For seeding the registry from a snapshot (server-rendered, or persisted):

```ts
// Seed known values at registry creation
AtomRegistry.make({ initialValues: [Atom.initialValue(myAtom, value)] })

// Or from a dehydrated snapshot, transition-safe, in React:
<HydrationBoundary state={dehydratedState}>...</HydrationBoundary>

// Produce a snapshot from a registry (serializable atoms only):
const snapshot = Hydration.dehydrate(registry)
```

Atoms must be `Atom.serializable({ key, schema })` to be (de)hydrated.
`AtomRpc`/`AtomHttpApi` query atoms are serializable when given a stable
`serializationKey`. Note: the `"promise"` handoff for in-flight `Initial` values
is a live JS promise — it can't cross a process/JSON boundary; use `"ignore"` or
`"value-only"` for cross-process.

> Today we preload **imperatively** (`prefetch.ts` mounts/subscribes against the
> singleton registry) rather than via hydration snapshots. That's the right call
> while data comes from a live local relay — there's nothing to "rehydrate."
> Reach for `Hydration`/`kvs` only when you want startup state to survive with
> *no* server round-trip (true offline cold-start).

### Service-backed atoms — `Atom.runtime`

```ts
const runtime = Atom.runtime(MyServicesLayer)
const thing = runtime.atom(Effect.gen(function* () { /* use services */ }))
const doThing = runtime.fn(handler, { reactivityKeys: ["things"] })
```

This is how `AtomRpc.Service` wires our RPC client into atoms. Use the same
pattern to give atoms access to any sync-engine service (DB, network, outbox).

### Control symbols for `fn` atoms

```ts
registry.set(fnAtom, Atom.Reset)      // clear back to Initial
registry.set(fnAtom, Atom.Interrupt)  // interrupt the in-flight effect
```

---

## React hooks cheat-sheet

All from `@effect/atom-react`. Each reads the registry from `RegistryContext`.

| Hook | Use |
|---|---|
| `useAtomValue(atom, selector?)` | read a value (optionally a memoized projection) |
| `useAtom(atom, { mode? })` | `[value, write]` for a writable atom |
| `useAtomSet(atom, { mode? })` | setter only (no re-render on value). `mode: "value" \| "promise" \| "promiseExit"` |
| `useAtomRefresh(atom)` | `() => void` to force a refresh |
| `useAtomMount(atom)` | keep an atom warm for the component's lifetime (no read) |
| `useAtomSuspense(atom, { suspendOnWaiting?, includeFailure? })` | Suspense; SWR by default (no re-suspend on refresh) |
| `useAtomSubscribe(atom, f, { immediate? })` | run a callback on change without rendering |
| `useAtomInitialValues(pairs)` | seed values into the registry from a component |
| `useAtomRef` / `useAtomRefProp` / `useAtomRefPropValue` | read/derive from an `AtomRef` |

Provider setup (we use a shared singleton, not the auto-minted one):

```ts
// rpc/registry.ts owns the registry; main.tsx provides it:
<RegistryContext.Provider value={appRegistry}>{app}</RegistryContext.Provider>
```

`ScopedAtom` (`make()` from `@effect/atom-react`) gives per-subtree atom
instances when you need an atom scoped to a feature/route instead of global.

---

## Sync-engine architecture

What `@effect/atom` gives you, and what it doesn't.

**It gives you** the entire reactive surface of a sync engine:
- a single in-memory store (the registry) with GC + TTL,
- `AsyncResult` loading/error/stale state with previous-value retention,
- optimistic apply + automatic rollback,
- query-key invalidation,
- focus/interval/signal revalidation,
- persistence + hydration primitives,
- native binding to your Effect RPC client.

**It does not give you** (you build these as Effect services, wired via
`Atom.runtime`):
- a **durable mutation outbox** (queue writes while offline, replay on reconnect),
- **retry / backoff** policy for failed syncs,
- **conflict resolution** / merge when local and server diverge,
- **ordering guarantees** across dependent mutations.

### Recommended shape for "local-first, sync later"

Two viable models — pick based on how offline you really need to be:

**Model A — server-state-as-cache (where you are today, recommended start).**
The server (via the local relay) is the source of truth; query atoms are a warm,
`keepAlive` cache; mutations are optimistic and invalidate by reactivity key.
This already feels instant because the relay is local and prefetch warms
everything. Add optimistic mutations next (Section 5) and you're done. This is
the lowest-risk path and covers "feels instant + heavy optimistic + rollback."

**Model B — true local-first (only if you need real offline).** Promote a local
store to source of truth:
- Hold canonical local state in `Atom.kvs` (durable) or `AtomRef`/writable atoms.
- Render the UI **only** from local state — never block on the network.
- Every mutation: (1) write local state immediately (optimistic by construction),
  (2) enqueue a sync intent in a durable **outbox** (an Effect service, persisted),
  (3) a background fiber drains the outbox to the server with retry/backoff,
  (4) on server ack, reconcile (and resolve conflicts) back into local state.
- Atoms subscribe to the local store, so the UI is always instant and the network
  is invisible.

The seam between them is small: in Model A your optimistic reducer + reactivity
invalidation *is* a degenerate outbox (depth 1, no persistence). Start with A,
and only build the outbox/conflict service if you actually need offline
durability. Don't build Model B speculatively.

### Concrete next steps for this repo

1. **Add a mutations module** (`rpc/mutations.ts`) mirroring `rpc/queries.ts`:
   centralize each `Client.mutation(tag)`, paired with the **same**
   `reactivityKeys` as the query it affects (e.g. `["workspaces", projectId]`),
   so a create/delete refetches the right list. The query doc comments already
   anticipate this ("shared with the create/delete mutations").
2. **Make those mutations optimistic** with `Atom.optimistic` + `Atom.optimisticFn`
   over the relevant query atom, so the sidebar updates the instant the user acts
   and rolls back on RPC failure.
3. **Keep the singleton-registry discipline.** Optimism, invalidation, and
   prefetch all assume one registry and one cache node per logical query — which
   is exactly why `rpc/registry.ts` and the family-memoized builders in
   `rpc/queries.ts` exist. Route every new read/write through those builders.
4. **Defer durability.** Only introduce `Atom.kvs`/an outbox service when you
   have a concrete offline requirement.

---

## Gotchas / footguns

- **One registry.** Multiple registries = multiple caches. We deliberately own a
  singleton; don't let stray `RegistryProvider`s mint private ones.
- **Identity drift.** Reconstruct query calls *identically* everywhere (same
  payload, `reactivityKeys`, `timeToLive`, `serializationKey`) or you get a
  second cache node and refreshes that miss. Centralize in builders.
- **`AsyncResult.value` reads through failures.** Check `isFailure`/`error` when
  you must tell stale-data-behind-an-error from a real success.
- **Invalidation is success-only.** A failed mutation won't refetch — by design.
  Don't rely on a failed write to "self-correct" dependent queries.
- **`keepAlive` is a memory commitment.** It opts out of GC for the session. Use
  it for session-resident reads; don't blanket-apply it to per-screen atoms.
- **In-place mutation doesn't notify** (`AtomRef`, and object values generally).
  Always produce a new value via `set`/`update`.
- **Hydration `"promise"` mode is process-local.** Don't try to send it across a
  worker/process/JSON boundary.
- **Beta API.** `effect/unstable/reactivity` names can change between betas
  (we just jumped 76→78). Re-verify combinator names after a bump.

---

## Reference: import map

```ts
// Core (lives inside `effect` now)
import {
  Atom, AsyncResult, AtomRegistry, AtomRef,
  AtomRpc, AtomHttpApi, Hydration, Reactivity,
} from "effect/unstable/reactivity"

// React bindings
import {
  useAtomValue, useAtom, useAtomSet, useAtomRefresh, useAtomMount,
  useAtomSuspense, useAtomSubscribe, useAtomInitialValues,
  useAtomRef, useAtomRefProp, useAtomRefPropValue,
  RegistryContext, RegistryProvider, scheduleTask,
  HydrationBoundary, make as scopedAtom,
} from "@effect/atom-react"
```
