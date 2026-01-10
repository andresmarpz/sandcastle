# Effect-Atom: Complete Guide to Data Fetching Patterns

This guide covers best practices for using `effect-atom` to achieve common data fetching UX patterns typically done with `@tanstack/react-query`. Effect-atom is a reactive state management library built on top of Effect, providing reactive atoms with seamless integration with Effect's types, services, and layers.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Setting Up](#setting-up)
3. [Queries](#queries)
4. [Mutations](#mutations)
5. [Optimistic Updates](#optimistic-updates)
6. [Query Invalidation](#query-invalidation)
7. [Refetching Patterns](#refetching-patterns)
8. [Caching and Stale Data](#caching-and-stale-data)
9. [Error Handling](#error-handling)
10. [Advanced Patterns](#advanced-patterns)
11. [RPC Integration with @effect/rpc](#rpc-integration-with-effectrpc)

---

## Core Concepts

### Atom

An `Atom<A>` is a reactive state container. It can hold:
- **Primitive values**: `Atom.make(0)` creates a `Writable<number>`
- **Computed values**: `Atom.make((get) => get(other) * 2)` creates a derived `Atom<number>`
- **Effects**: `Atom.make(Effect.succeed(42))` creates an `Atom<Result<number>>`
- **Streams**: `Atom.make(Stream.range(1, 10))` creates an `Atom<Result<number>>`

### Result

Async operations return `Result<A, E>` which represents three states:

```typescript
type Result<A, E> =
  | Initial<A, E>    // Not loaded yet
  | Success<A, E>    // Loaded successfully
  | Failure<A, E>    // Failed to load

interface Success<A, E> {
  readonly _tag: "Success"
  readonly value: A
  readonly timestamp: number      // When cached
  readonly waiting: boolean       // Refetch in progress?
}

interface Failure<A, E> {
  readonly _tag: "Failure"
  readonly cause: Cause.Cause<E>
  readonly previousSuccess?: Success<A, E>  // For rollback
  readonly waiting: boolean
}
```

### Registry

The `Registry` manages atom instances and their lifecycle. It handles subscriptions, garbage collection, and dependency tracking.

---

## Setting Up

### Basic Setup with React

```typescript
import { RegistryProvider, useAtomValue, useAtom } from "@effect-atom/atom-react"

function App() {
  return (
    <RegistryProvider
      defaultIdleTTL={400}  // Auto-cleanup after 400ms idle
    >
      <YourApp />
    </RegistryProvider>
  )
}
```

### With Initial Values (for testing or SSR)

```typescript
<RegistryProvider
  initialValues={[
    [userAtom, { id: 1, name: "Alice" }],
    [settingsAtom, { theme: "dark" }]
  ]}
>
  <App />
</RegistryProvider>
```

---

## Queries

### Basic Query

```typescript
import * as Atom from "@effect-atom/atom-react"
import { Effect } from "effect"

// Define a query atom
const usersAtom = Atom.Atom.make(
  Effect.tryPromise(() =>
    fetch("/api/users").then(r => r.json())
  )
)

// Use in component
function UsersList() {
  const result = Atom.useAtomValue(usersAtom)

  return Atom.Result.match(result, {
    onInitial: () => <div>Loading...</div>,
    onSuccess: ({ value }) => (
      <ul>
        {value.map(user => <li key={user.id}>{user.name}</li>)}
      </ul>
    ),
    onFailure: ({ cause }) => <div>Error: {Cause.pretty(cause)}</div>
  })
}
```

### Query with Suspense

```typescript
import { Suspense } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { useAtomSuspense } from "@effect-atom/atom-react"

function UserProfile() {
  const { value: user } = useAtomSuspense(userAtom)
  return <div>{user.name}</div>
}

function App() {
  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  )
}
```

### Parameterized Queries (Query by ID)

Use `Atom.family` to create queries with parameters:

```typescript
// Define a family of atoms keyed by user ID
const userByIdAtom = Atom.Atom.family((userId: string) =>
  Atom.Atom.make(
    Effect.tryPromise(() =>
      fetch(`/api/users/${userId}`).then(r => r.json())
    )
  )
)

// Usage
function UserDetail({ userId }: { userId: string }) {
  const result = useAtomValue(userByIdAtom(userId))

  return Result.match(result, {
    onInitial: () => <Loading />,
    onSuccess: ({ value }) => <UserCard user={value} />,
    onFailure: () => <Error />
  })
}
```

### Computed/Derived Queries

```typescript
const usersAtom = Atom.Atom.make(
  Effect.succeed([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }])
)

// Derived atom that depends on usersAtom
const userCountAtom = Atom.Atom.make((get) => {
  const result = get(usersAtom)
  if (result._tag === "Success") {
    return result.value.length
  }
  return 0
})

// Or using mapResult for Result atoms
const firstUserAtom = usersAtom.pipe(
  Atom.Atom.mapResult(users => users[0])
)
```

### Query with Effect Services

```typescript
import { Effect, Layer } from "effect"

// Define a service
class UsersApi extends Effect.Service<UsersApi>()("UsersApi", {
  effect: Effect.gen(function* () {
    const getAll = () => Effect.tryPromise(() =>
      fetch("/api/users").then(r => r.json())
    )
    const getById = (id: string) => Effect.tryPromise(() =>
      fetch(`/api/users/${id}`).then(r => r.json())
    )
    return { getAll, getById } as const
  })
}) {}

// Create a runtime bound to the service
const apiRuntime = Atom.Atom.runtime(UsersApi.Default)

// Create atoms using the runtime
const usersAtom = apiRuntime.atom(
  Effect.gen(function* () {
    const api = yield* UsersApi
    return yield* api.getAll()
  })
)

const userByIdAtom = Atom.Atom.family((id: string) =>
  apiRuntime.atom(
    Effect.gen(function* () {
      const api = yield* UsersApi
      return yield* api.getById(id)
    })
  )
)
```

---

## Mutations

### Basic Mutation

Mutations are created with `Atom.fn` which creates an atom that accepts input and returns a Result:

```typescript
// Define a mutation
const createUserMutation = Atom.Atom.fn(
  (userData: { name: string; email: string }) =>
    Effect.tryPromise(() =>
      fetch("/api/users", {
        method: "POST",
        body: JSON.stringify(userData)
      }).then(r => r.json())
    )
)

// Use in component
function CreateUserForm() {
  const [result, createUser] = useAtom(createUserMutation)

  const handleSubmit = (data: FormData) => {
    createUser({
      name: data.get("name") as string,
      email: data.get("email") as string
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {result._tag === "Success" && <div>User created!</div>}
      {result.waiting && <div>Creating...</div>}
      {/* form fields */}
    </form>
  )
}
```

### Mutation with Service Runtime

```typescript
const updateUserMutation = apiRuntime.fn<{ id: string; name: string }>()(
  Effect.fnUntraced(function*(payload) {
    const api = yield* UsersApi
    return yield* api.update(payload.id, { name: payload.name })
  })
)
```

---

## Optimistic Updates

Optimistic updates show the expected result immediately before the server confirms it. Effect-atom provides `Atom.optimistic` and `Atom.optimisticFn` for this pattern.

### Basic Optimistic Update

```typescript
import * as Atom from "@effect-atom/atom-react"
import * as Result from "@effect-atom/atom/Result"

// 1. Source query
const userAtom = Atom.Atom.make(
  Effect.tryPromise(() =>
    fetch("/api/user").then(r => r.json())
  )
)

// 2. Wrap with optimistic
const optimisticUserAtom = userAtom.pipe(Atom.Atom.optimistic)

// 3. Create optimistic mutation
const updateUserMutation = optimisticUserAtom.pipe(
  Atom.Atom.optimisticFn({
    // reducer: computes optimistic value from current + input
    reducer: (currentUser, newName: string) => ({
      ...currentUser,
      name: newName
    }),
    // fn: the actual mutation
    fn: Atom.Atom.fn((newName: string) =>
      Effect.tryPromise(() =>
        fetch("/api/user", {
          method: "PATCH",
          body: JSON.stringify({ name: newName })
        }).then(r => r.json())
      )
    )
  })
)

// Usage
function UserProfile() {
  const user = useAtomValue(optimisticUserAtom)
  const [, updateUser] = useAtom(updateUserMutation)

  return (
    <div>
      {Result.match(user, {
        onSuccess: ({ value, waiting }) => (
          <div>
            <span>{value.name}</span>
            {waiting && <span>(saving...)</span>}
          </div>
        ),
        onInitial: () => <span>Loading...</span>,
        onFailure: () => <span>Error</span>
      })}
      <button onClick={() => updateUser("New Name")}>
        Change Name
      </button>
    </div>
  )
}
```

### Optimistic Update Flow

1. **Optimistic Phase**: User sees updated value immediately
   - `reducer` computes the optimistic value
   - UI reflects the change with `waiting: true`

2. **Transition Phase**: Mutation executes on server
   - Previous value kept in memory for potential rollback

3. **Commit Phase**: After mutation completes
   - On success: underlying query refreshes with server data
   - On failure: automatically rolls back to previous value

### Optimistic Update with Result Type

When your query returns a `Result`, use `Result.success` in the reducer:

```typescript
const optimisticUserAtom = userAtom.pipe(Atom.Atom.optimistic)

const updateUserMutation = optimisticUserAtom.pipe(
  Atom.Atom.optimisticFn({
    reducer: (currentUser, newName: string) =>
      Result.success({ ...currentUser, name: newName }),
    fn: apiRuntime.fn((newName: string) =>
      Effect.gen(function* () {
        const api = yield* UsersApi
        return yield* api.update({ name: newName })
      })
    )
  })
)
```

### Intermediate Updates During Mutation

You can publish intermediate values while a mutation is in progress:

```typescript
const updateUserMutation = optimisticUserAtom.pipe(
  Atom.Atom.optimisticFn({
    reducer: (current, newName: string) => Result.success({ ...current, name: newName }),
    // `set` allows publishing intermediate values
    fn: (set) => Atom.Atom.fn((newName: string) =>
      Effect.gen(function* () {
        // Show intermediate state
        set(Result.success({ name: newName, status: "validating..." }))

        yield* validateName(newName)

        set(Result.success({ name: newName, status: "saving..." }))

        const result = yield* api.update({ name: newName })
        return result
      })
    )
  })
)
```

### Adding Item to List (Optimistic)

```typescript
// Query for list of todos
const todosAtom = Atom.Atom.make(
  Effect.tryPromise(() => fetch("/api/todos").then(r => r.json()))
)

const optimisticTodosAtom = todosAtom.pipe(Atom.Atom.optimistic)

// Mutation to add todo with optimistic update
const addTodoMutation = optimisticTodosAtom.pipe(
  Atom.Atom.optimisticFn({
    reducer: (currentTodos, newTodo: { title: string }) =>
      Result.success([
        ...currentTodos,
        { id: `temp-${Date.now()}`, title: newTodo.title, completed: false }
      ]),
    fn: Atom.Atom.fn((newTodo: { title: string }) =>
      Effect.tryPromise(() =>
        fetch("/api/todos", {
          method: "POST",
          body: JSON.stringify(newTodo)
        }).then(r => r.json())
      )
    )
  })
)
```

---

## Query Invalidation

### Manual Invalidation

```typescript
import { useAtomRefresh } from "@effect-atom/atom-react"

function RefreshButton() {
  const refresh = useAtomRefresh(usersAtom)

  return <button onClick={refresh}>Refresh Users</button>
}
```

### Invalidation via Registry

```typescript
import { RegistryContext } from "@effect-atom/atom-react"
import { useContext } from "react"

function AdminPanel() {
  const registry = useContext(RegistryContext)

  const handleClearCache = () => {
    registry.refresh(usersAtom)
    registry.refresh(settingsAtom)
  }

  return <button onClick={handleClearCache}>Clear Cache</button>
}
```

### Invalidation with Reactivity Keys

Reactivity keys allow mutations to automatically invalidate related queries:

```typescript
import { Reactivity } from "@effect/experimental"

// Query with reactivity keys
const usersAtom = Atom.Atom.make(() => fetchUsers()).pipe(
  Atom.Atom.withReactivity(["users"])  // Listens to "users" key
)

// Mutation that invalidates queries with matching keys
const createUserMutation = apiRuntime.fn<UserInput>()(
  Effect.fnUntraced(function*(input) {
    const result = yield* createUser(input)
    // Invalidate all atoms watching "users" key
    yield* Reactivity.invalidate(["users"])
    return result
  })
)
```

### Batch Invalidation

```typescript
import { batch } from "@effect-atom/atom"

// Multiple invalidations in a single update cycle
batch(() => {
  registry.refresh(usersAtom)
  registry.refresh(teamsAtom)
  registry.refresh(projectsAtom)
})
// Subscribers notified once, not three times
```

---

## Refetching Patterns

### Refetch on Window Focus

Built-in pattern similar to react-query's `refetchOnWindowFocus`:

```typescript
const usersAtom = Atom.Atom.make(
  Effect.tryPromise(() => fetch("/api/users").then(r => r.json()))
).pipe(
  Atom.Atom.refreshOnWindowFocus  // Auto-refetch when tab regains focus
)
```

### Custom Signal-Based Refresh

```typescript
// Create a custom signal
const customRefreshSignal = Atom.Atom.make(0)

// Atom that refreshes on signal
const usersAtom = Atom.Atom.make(
  Effect.tryPromise(() => fetch("/api/users").then(r => r.json()))
).pipe(
  Atom.Atom.makeRefreshOnSignal(customRefreshSignal)
)

// Trigger refresh by updating signal
function triggerRefresh() {
  registry.set(customRefreshSignal, n => n + 1)
}
```

### Polling (Interval-Based Refetch)

Use Streams for continuous polling:

```typescript
import { Stream, Schedule } from "effect"

// Poll every 5 seconds
const liveDataAtom = Atom.Atom.make(
  Stream.fromEffect(
    Effect.tryPromise(() => fetch("/api/live-data").then(r => r.json()))
  ).pipe(
    Stream.repeat(Schedule.spaced("5 seconds"))
  )
)
```

### Programmatic Refetch

```typescript
function DataComponent() {
  const result = useAtomValue(dataAtom)
  const refresh = useAtomRefresh(dataAtom)

  useEffect(() => {
    // Refetch when some condition changes
    if (shouldRefetch) {
      refresh()
    }
  }, [shouldRefetch, refresh])

  return <div>{/* render data */}</div>
}
```

---

## Caching and Stale Data

### Stale-While-Revalidate Pattern

Effect-atom supports showing old data while fetching new data via the `waiting` flag:

```typescript
function UsersList() {
  const result = useAtomValue(usersAtom)

  return Result.match(result, {
    onSuccess: ({ value, waiting }) => (
      <div>
        <ul style={{ opacity: waiting ? 0.5 : 1 }}>
          {value.map(user => <li key={user.id}>{user.name}</li>)}
        </ul>
        {waiting && <LoadingOverlay />}
      </div>
    ),
    onInitial: () => <Loading />,
    onFailure: () => <Error />
  })
}
```

### Cache Time-To-Live (TTL)

```typescript
// Atom stays cached for 5 seconds after last subscriber unmounts
const cachedUsersAtom = usersAtom.pipe(
  Atom.Atom.setIdleTTL("5 seconds")
)

// Prevent auto-disposal entirely
const persistentAtom = usersAtom.pipe(
  Atom.Atom.keepAlive
)
```

### Initial Value (Placeholder Data)

```typescript
const usersAtom = Atom.Atom.make(
  Effect.tryPromise(() => fetch("/api/users").then(r => r.json())),
  { initialValue: [] }  // Start with empty array instead of Initial state
)
```

### Debounced Queries

Prevent excessive fetches from rapid input changes:

```typescript
const searchQueryAtom = Atom.Atom.make("")
const searchResultsAtom = Atom.Atom.make((get) => {
  const query = get(searchQueryAtom)
  return Effect.tryPromise(() =>
    fetch(`/api/search?q=${query}`).then(r => r.json())
  )
}).pipe(
  Atom.Atom.debounce("500 millis")  // Wait 500ms after last change
)
```

---

## Error Handling

### Pattern Matching on Result

```typescript
function DataView() {
  const result = useAtomValue(dataAtom)

  return Result.match(result, {
    onInitial: () => <Skeleton />,
    onSuccess: ({ value }) => <DataDisplay data={value} />,
    onFailure: ({ cause }) => (
      <ErrorDisplay message={Cause.pretty(cause)} />
    )
  })
}
```

### Error with Previous Data

When a refetch fails, the previous success is preserved:

```typescript
return Result.match(result, {
  onFailure: ({ cause, previousSuccess }) => (
    <div>
      <Alert>Failed to refresh: {Cause.pretty(cause)}</Alert>
      {Option.isSome(previousSuccess) && (
        <DataDisplay
          data={previousSuccess.value.value}
          stale
        />
      )}
    </div>
  ),
  // ...
})
```

### Retry on Error

```typescript
const dataAtom = Atom.Atom.make(
  Effect.tryPromise(() => fetch("/api/data").then(r => r.json())).pipe(
    Effect.retry({ times: 3, delay: "1 second" })
  )
)
```

---

## Advanced Patterns

### Server-Side Rendering (SSR)

```typescript
// Server: Dehydrate state
const registry = Registry.make()
registry.mount(usersAtom)
await waitForQueries()

const dehydratedState = Hydration.dehydrate(registry, {
  encodeInitialAs: "promise"  // Stream pending states to client
})

// Client: Hydrate
function App({ dehydratedState }) {
  return (
    <HydrationBoundary state={dehydratedState}>
      <YourApp />
    </HydrationBoundary>
  )
}
```

### Local Storage Persistence

```typescript
import { BrowserKeyValueStore } from "@effect/platform-browser"

const storageRuntime = Atom.Atom.runtime(
  BrowserKeyValueStore.layerLocalStorage
)

const cachedUserPrefs = Atom.Atom.kvs({
  runtime: storageRuntime,
  key: "user-preferences",
  schema: Schema.Struct({
    theme: Schema.String,
    language: Schema.String
  }),
  defaultValue: () => ({ theme: "light", language: "en" })
})
```

### URL Search Params Sync

```typescript
const filterAtom = Atom.Atom.searchParam("filter", {
  schema: Schema.String,
  defaultValue: ""
})

// Changes to filterAtom automatically update URL
// URL changes automatically update filterAtom
```

### Streaming/Pagination (Pull Pattern)

```typescript
const paginatedDataAtom = Atom.Atom.pull(
  Stream.paginateEffect(0, (page) =>
    Effect.gen(function* () {
      const response = yield* fetchPage(page)
      const nextPage = response.hasMore ? Option.some(page + 1) : Option.none()
      return [response.items, nextPage] as const
    })
  )
)

function PaginatedList() {
  const [result, loadMore] = useAtom(paginatedDataAtom)

  return (
    <div>
      {Result.match(result, {
        onSuccess: ({ value }) => (
          <>
            <ul>
              {value.items.map(item => <li key={item.id}>{item.name}</li>)}
            </ul>
            {!value.done && (
              <button onClick={() => loadMore()}>Load More</button>
            )}
          </>
        ),
        // ...
      })}
    </div>
  )
}
```

### Conditional Queries (Enabled/Disabled)

```typescript
const userIdAtom = Atom.Atom.make<string | null>(null)

const userDetailsAtom = Atom.Atom.make((get) => {
  const userId = get(userIdAtom)
  if (userId === null) {
    return Result.initial()  // Don't fetch if no userId
  }
  return Effect.tryPromise(() =>
    fetch(`/api/users/${userId}`).then(r => r.json())
  )
})
```

### Dependent Queries

```typescript
const userAtom = Atom.Atom.make(
  Effect.tryPromise(() => fetch("/api/me").then(r => r.json()))
)

// This query depends on userAtom
const userProjectsAtom = Atom.Atom.make((get) => {
  const userResult = get(userAtom)

  if (userResult._tag !== "Success") {
    return userResult  // Pass through loading/error state
  }

  return Effect.tryPromise(() =>
    fetch(`/api/users/${userResult.value.id}/projects`).then(r => r.json())
  )
})
```

---

## Comparison with React Query

| React Query | Effect-Atom |
|-------------|-------------|
| `useQuery({ queryKey, queryFn })` | `useAtomValue(Atom.make(effect))` |
| `useMutation({ mutationFn })` | `useAtom(Atom.fn(fn))` |
| `queryClient.invalidateQueries()` | `registry.refresh(atom)` |
| `refetchOnWindowFocus: true` | `Atom.refreshOnWindowFocus` |
| `staleTime` | `Atom.setIdleTTL` |
| `placeholderData` | `{ initialValue: ... }` |
| `select` | `useAtomValue(atom, selector)` or `Atom.mapResult` |
| Query keys | `Atom.family(key => ...)` |
| `onSuccess/onError` | Pattern match on Result |
| Optimistic updates | `Atom.optimistic` + `Atom.optimisticFn` |

---

## Summary

Effect-atom provides a powerful, type-safe approach to data fetching that integrates deeply with Effect's ecosystem:

1. **Queries**: Use `Atom.make(effect)` for async data
2. **Mutations**: Use `Atom.fn(fn)` for operations that modify data
3. **Optimistic Updates**: Use `Atom.optimistic` + `Atom.optimisticFn` with automatic rollback
4. **Invalidation**: Use `registry.refresh()` or `Reactivity.invalidate()` with keys
5. **Refetching**: Use `refreshOnWindowFocus`, streams for polling, or manual refresh
6. **Caching**: Use `setIdleTTL` for cache duration, `waiting` flag for stale-while-revalidate

The Result type system provides first-class loading and error states, while Effect's service layer enables clean dependency injection and testing.

---

## RPC Integration with @effect/rpc

Effect-atom provides `AtomRpc` for seamless integration with `@effect/rpc`, enabling type-safe, reactive RPC clients with automatic caching and invalidation.

### Understanding the Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React App                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   RegistryProvider                       │    │
│  │  ┌─────────────────────────────────────────────────────┐│    │
│  │  │                  Atom Registry                      ││    │
│  │  │  ┌──────────────┐  ┌──────────────┐                ││    │
│  │  │  │ WorktreeClient│  │  ChatClient  │  (RPC Clients) ││    │
│  │  │  │   .query()   │  │   .query()   │                ││    │
│  │  │  │  .mutation() │  │  .mutation() │                ││    │
│  │  │  └──────────────┘  └──────────────┘                ││    │
│  │  │         │                  │                        ││    │
│  │  │         ▼                  ▼                        ││    │
│  │  │  ┌─────────────────────────────────────────────┐   ││    │
│  │  │  │           Shared Reactivity Service          │   ││    │
│  │  │  │     (invalidation keys are GLOBAL)          │   ││    │
│  │  │  └─────────────────────────────────────────────┘   ││    │
│  │  └─────────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Defining RPC Groups (Server & Shared)

First, define your RPC schemas in a shared package:

```typescript
// packages/rpc/src/worktrees/schema.ts
import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

// Define your data models
export class Worktree extends Schema.Class<Worktree>("Worktree")({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  repositoryId: Schema.String,
  lastAccessedAt: Schema.DateFromNumber,
}) {}

export class CreateWorktreeRequest extends Schema.Class<CreateWorktreeRequest>(
  "CreateWorktreeRequest"
)({
  name: Schema.String,
  repositoryId: Schema.String,
  branch: Schema.String,
}) {}

// Define the RPC group
export class WorktreeRpc extends RpcGroup.make(
  Rpc.make("worktree.list", {
    success: Schema.Array(Worktree),
  }),
  Rpc.make("worktree.listByRepository", {
    success: Schema.Array(Worktree),
    payload: { repositoryId: Schema.String },
  }),
  Rpc.make("worktree.get", {
    success: Worktree,
    error: Schema.String,
    payload: { id: Schema.String },
  }),
  Rpc.make("worktree.create", {
    success: Worktree,
    error: Schema.String,
    payload: CreateWorktreeRequest,
  }),
  Rpc.make("worktree.update", {
    success: Worktree,
    error: Schema.String,
    payload: { id: Schema.String, name: Schema.String },
  }),
  Rpc.make("worktree.delete", {
    success: Schema.Void,
    error: Schema.String,
    payload: { id: Schema.String },
  }),
) {}
```

### Creating the AtomRpc Client

```typescript
// packages/ui/src/api/worktree-client.ts
import { AtomRpc } from "@effect-atom/atom-react"
import { FetchHttpClient } from "@effect/platform"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { Layer } from "effect"
import { WorktreeRpc } from "@myapp/rpc"

const RPC_URL = "http://localhost:3000/api/rpc"

/**
 * AtomRpc client for WorktreeRpc operations.
 * This creates a Context.Tag that provides typed query/mutation methods.
 */
export class WorktreeClient extends AtomRpc.Tag<WorktreeClient>()(
  "WorktreeClient",
  {
    group: WorktreeRpc,
    protocol: RpcClient.layerProtocolHttp({ url: RPC_URL }).pipe(
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(FetchHttpClient.layer),
    ),
    // Optional: tracing configuration
    spanPrefix: "WorktreeRpc",
    disableTracing: false,
  },
) {}

// Define reactivity key constants for consistency
export const WORKTREE_LIST_KEY = "worktrees" as const
```

### Single Client vs Multiple Clients

**Recommendation: One client per RPC group (domain)**

```typescript
// ✅ GOOD: Separate clients for separate domains
export class WorktreeClient extends AtomRpc.Tag<WorktreeClient>()(
  "WorktreeClient",
  { group: WorktreeRpc, protocol: httpProtocol }
) {}

export class ChatClient extends AtomRpc.Tag<ChatClient>()(
  "ChatClient",
  { group: ChatRpc, protocol: httpProtocol }
) {}

export class SessionClient extends AtomRpc.Tag<SessionClient>()(
  "SessionClient",
  { group: SessionRpc, protocol: httpProtocol }
) {}
```

**Why multiple clients are fine:**

1. **Reactivity keys are GLOBAL** - They're managed by the `Reactivity` service at the registry level, not per-client
2. **Each client has its own layer** - The RPC connection is scoped per client
3. **Caching is per-atom** - TTL is set on individual query atoms, not the client
4. **Clean separation** - Each domain has its own type-safe client

**When to use a single client:**

- If all your RPCs are in one `RpcGroup` (small app)
- If you want to share connection pooling (WebSocket)

### Defining Query and Mutation Atoms

```typescript
// packages/ui/src/api/worktree-atoms.ts
import { Atom } from "@effect-atom/atom-react"
import { WorktreeClient, WORKTREE_LIST_KEY } from "./worktree-client"

// ─── Query Atoms ─────────────────────────────────────────────

/**
 * List all worktrees.
 * Uses reactivity keys so mutations can invalidate this query.
 */
export const worktreeListAtom = WorktreeClient.query(
  "worktree.list",
  {},  // payload
  {
    reactivityKeys: [WORKTREE_LIST_KEY],
    timeToLive: 300_000,  // 5 minutes cache
  },
)

/**
 * Parameterized query: worktrees by repository.
 * Uses Atom.family to create one cached atom per repositoryId.
 */
export const worktreesByRepositoryAtom = Atom.family((repositoryId: string) =>
  WorktreeClient.query(
    "worktree.listByRepository",
    { repositoryId },
    {
      // Multiple keys: global list + repo-specific
      reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:repo:${repositoryId}`],
      timeToLive: 300_000,
    },
  )
)

/**
 * Single worktree by ID.
 */
export const worktreeAtom = Atom.family((id: string) =>
  WorktreeClient.query(
    "worktree.get",
    { id },
    {
      reactivityKeys: [`worktree:${id}`],
      timeToLive: 300_000,
    },
  )
)

// ─── Mutation Atoms ─────────────────────────────────────────

/**
 * Create worktree mutation.
 * When called, pass reactivityKeys to invalidate related queries.
 */
export const createWorktreeMutation = WorktreeClient.mutation("worktree.create")

/**
 * Update worktree mutation.
 */
export const updateWorktreeMutation = WorktreeClient.mutation("worktree.update")

/**
 * Delete worktree mutation.
 */
export const deleteWorktreeMutation = WorktreeClient.mutation("worktree.delete")
```

### Using Queries in Components

```typescript
import { useAtomValue, useAtomRefresh, Result } from "@effect-atom/atom-react"
import { worktreeListAtom, worktreesByRepositoryAtom, worktreeAtom } from "./worktree-atoms"

// Simple list query
function WorktreeList() {
  const result = useAtomValue(worktreeListAtom)
  const refresh = useAtomRefresh(worktreeListAtom)

  return Result.match(result, {
    onInitial: () => <Loading />,
    onSuccess: ({ value: worktrees, waiting }) => (
      <div>
        {waiting && <RefreshIndicator />}
        <button onClick={refresh}>Refresh</button>
        <ul>
          {worktrees.map(wt => (
            <li key={wt.id}>{wt.name}</li>
          ))}
        </ul>
      </div>
    ),
    onFailure: ({ cause }) => <Error message={Cause.pretty(cause)} />,
  })
}

// Parameterized query
function RepositoryWorktrees({ repositoryId }: { repositoryId: string }) {
  const result = useAtomValue(worktreesByRepositoryAtom(repositoryId))

  return Result.match(result, {
    onInitial: () => <Loading />,
    onSuccess: ({ value }) => <WorktreeGrid worktrees={value} />,
    onFailure: () => <Error />,
  })
}

// Single item query
function WorktreeDetail({ id }: { id: string }) {
  const result = useAtomValue(worktreeAtom(id))

  return Result.match(result, {
    onSuccess: ({ value }) => <WorktreeCard worktree={value} />,
    onInitial: () => <Skeleton />,
    onFailure: () => <NotFound />,
  })
}
```

### Using Mutations with Reactivity Keys

```typescript
import { useAtom, WORKTREE_LIST_KEY } from "@effect-atom/atom-react"
import { createWorktreeMutation, deleteWorktreeMutation } from "./worktree-atoms"

function CreateWorktreeForm({ repositoryId }: { repositoryId: string }) {
  const [result, createWorktree] = useAtom(createWorktreeMutation)

  const handleSubmit = async (data: FormData) => {
    createWorktree({
      payload: {
        name: data.get("name") as string,
        repositoryId,
        branch: data.get("branch") as string,
      },
      // These keys will be invalidated after mutation succeeds
      reactivityKeys: [
        WORKTREE_LIST_KEY,                    // Invalidate global list
        `worktrees:repo:${repositoryId}`,     // Invalidate repo-specific list
      ],
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {result.waiting && <Spinner />}
      {result._tag === "Failure" && <Error />}
      {/* form fields */}
    </form>
  )
}

function DeleteWorktreeButton({ worktree }: { worktree: Worktree }) {
  const [result, deleteWorktree] = useAtom(deleteWorktreeMutation)

  const handleDelete = () => {
    deleteWorktree({
      payload: { id: worktree.id },
      reactivityKeys: [
        WORKTREE_LIST_KEY,
        `worktrees:repo:${worktree.repositoryId}`,
        `worktree:${worktree.id}`,  // Invalidate the specific item too
      ],
    })
  }

  return (
    <button onClick={handleDelete} disabled={result.waiting}>
      {result.waiting ? "Deleting..." : "Delete"}
    </button>
  )
}
```

### How Reactivity Keys Work

Reactivity keys create a pub/sub system for cache invalidation:

```
┌─────────────────────────────────────────────────────────────┐
│                   Reactivity Service                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Key: "worktrees"                                       ││
│  │  Subscribers: [worktreeListAtom, worktreesByRepo("1")] ││
│  ├─────────────────────────────────────────────────────────┤│
│  │  Key: "worktrees:repo:repo-123"                        ││
│  │  Subscribers: [worktreesByRepo("repo-123")]            ││
│  ├─────────────────────────────────────────────────────────┤│
│  │  Key: "worktree:wt-456"                                ││
│  │  Subscribers: [worktreeAtom("wt-456")]                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘

When mutation completes with reactivityKeys: ["worktrees", "worktree:wt-456"]
  → All atoms subscribed to those keys are refreshed automatically
```

**Key formats (conventions):**

```typescript
// Global list
const WORKTREE_LIST_KEY = "worktrees"

// Scoped by parent
const repoWorktreesKey = (repoId: string) => `worktrees:repo:${repoId}`

// Single item
const worktreeKey = (id: string) => `worktree:${id}`
```

### TTL and Caching Behavior

TTL (`timeToLive`) controls how long an atom stays cached after unmounting:

```typescript
// Query with 5-minute TTL
const usersAtom = MyClient.query("users.list", {}, {
  timeToLive: 300_000,  // 5 minutes in ms
})

// Query with infinite cache (never auto-disposed)
const configAtom = MyClient.query("config.get", {}, {
  timeToLive: Infinity,  // or use Duration.infinity
})

// Query with no caching (disposed immediately on unmount)
const liveDataAtom = MyClient.query("metrics.live", {}, {
  // No timeToLive = uses registry's defaultIdleTTL
})
```

**TTL is per-atom, not per-client:**

```typescript
// Same client, different TTLs
const frequentlyChangingData = WorktreeClient.query("data.hot", {}, {
  timeToLive: 10_000,  // 10 seconds
})

const rarelyChangingData = WorktreeClient.query("data.cold", {}, {
  timeToLive: 3_600_000,  // 1 hour
})
```

### RegistryProvider Configuration

The `RegistryProvider` manages all atoms, regardless of which RPC client created them:

```typescript
import { RegistryProvider } from "@effect-atom/atom-react"

function App() {
  return (
    <RegistryProvider
      // Default TTL for atoms that don't specify one
      defaultIdleTTL={400}

      // Pre-populate atoms (useful for SSR or testing)
      initialValues={[
        [worktreeListAtom, [/* initial data */]],
      ]}
    >
      <YourApp />
    </RegistryProvider>
  )
}
```

**Important: One RegistryProvider per app**

All RPC clients share the same registry, which means:
- Reactivity keys work across clients
- TTL is managed centrally
- Atoms from different clients can depend on each other

### Testing with Layer Replacement

```typescript
import { Layer } from "effect"

// In tests, replace the RPC client layer
<RegistryProvider
  initialValues={[
    // Replace the WorktreeClient layer with a mock
    Atom.initialValue(
      WorktreeClient.layer,
      Layer.succeed(WorktreeClient, mockClient)
    ),
  ]}
>
  <ComponentUnderTest />
</RegistryProvider>
```

### Complete Example: Multi-Domain App

```typescript
// clients.ts
export class WorktreeClient extends AtomRpc.Tag<WorktreeClient>()(
  "WorktreeClient",
  { group: WorktreeRpc, protocol: httpProtocol }
) {}

export class ChatClient extends AtomRpc.Tag<ChatClient>()(
  "ChatClient",
  { group: ChatRpc, protocol: httpProtocol }
) {}

export class SessionClient extends AtomRpc.Tag<SessionClient>()(
  "SessionClient",
  { group: SessionRpc, protocol: httpProtocol }
) {}

// atoms.ts
export const worktreeListAtom = WorktreeClient.query("list", {}, {
  reactivityKeys: ["worktrees"],
})

export const chatMessagesAtom = Atom.family((chatId: string) =>
  ChatClient.query("messages.list", { chatId }, {
    reactivityKeys: [`chat:${chatId}:messages`],
  })
)

export const currentSessionAtom = SessionClient.query("current", {}, {
  reactivityKeys: ["session"],
  timeToLive: Infinity,  // Keep session cached
})

// mutations that cross domains
export const sendMessageMutation = ChatClient.mutation("messages.send")

// Usage: send message and update session's lastActivity
function SendMessage({ chatId }: { chatId: string }) {
  const [, sendMessage] = useAtom(sendMessageMutation)

  const handleSend = (text: string) => {
    sendMessage({
      payload: { chatId, text },
      reactivityKeys: [
        `chat:${chatId}:messages`,  // Refresh chat messages
        "session",                   // Refresh session (updates lastActivity)
      ],
    })
  }
}
```

### Best Practices Summary

1. **One client per RPC group** - Clean separation, type safety
2. **Define reactivity keys as constants** - Avoid typos, enable refactoring
3. **Use Atom.family for parameterized queries** - Proper caching per parameter
4. **Always pass reactivityKeys to mutations** - Automatic cache invalidation
5. **Set appropriate TTL per query** - Hot data = short TTL, cold data = long TTL
6. **Use object-form reactivity keys for complex cases** - Better organization

```typescript
// Array form: simple
reactivityKeys: ["worktrees", "worktree:123"]

// Object form: grouped by category
reactivityKeys: {
  worktrees: ["list", "repo:123"],
  user: ["activity"],
}
```

### Comparison: Direct RPC vs AtomRpc

| Direct RpcClient | AtomRpc |
|------------------|---------|
| `client.users.list({})` | `useAtomValue(usersListAtom)` |
| Manual caching | Automatic caching with TTL |
| Manual refetch | Automatic with reactivity keys |
| Effect-based | React hooks integration |
| One-shot calls | Reactive subscriptions |
| No deduplication | Atom.family deduplication |
