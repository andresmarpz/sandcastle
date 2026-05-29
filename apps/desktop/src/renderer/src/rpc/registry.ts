import { scheduleTask } from "@effect/atom-react";
import { AtomRegistry } from "effect/unstable/reactivity";

/**
 * The app's single Atom registry instance.
 *
 * We own it as a module singleton instead of letting `<RegistryProvider>` mint
 * a private one, so non-React code can imperatively refresh server-state
 * queries. The MCP bridge (`lib/mcpBridge.ts`) runs outside React as a plain
 * module: when a worktree teleport creates a workspace out of band (main posts
 * directly to the relay, bypassing this WS RPC client), the bridge refreshes
 * the sidebar's `workspaces.list` atom against this registry so the new
 * workspace appears without a reload.
 *
 * `main.tsx` hands this exact instance to `RegistryContext.Provider`, so the
 * React tree and the bridge share one registry. Options mirror
 * `@effect/atom-react`'s `RegistryProvider` defaults.
 */
export const appRegistry = AtomRegistry.make({
	scheduleTask,
	defaultIdleTTL: 400,
});
