import { create } from "zustand";

import type { PrStatus } from "@/hooks/usePrStatus";

// Renderer-side cache of resolved worktree PR statuses, keyed by the worktree's
// `repoPath` — the same key main caches under for `github:pr-status`. Startup
// warms this for every worktree before lifting the loading screen (see
// lib/startup.ts), so each sidebar row paints its badge on first frame instead
// of flashing empty and trickling in after reveal. `usePrStatus` reads from here
// and writes its own (re)fetches back, keeping the two in lockstep.
//
// A present key means "resolved": the value is the PR status, or `null` for a
// worktree with no PR / unreachable repo. A missing key means "not yet checked".
type State = {
	byPath: Record<string, PrStatus | null>;
};

type Actions = {
	set: (repoPath: string, status: PrStatus | null) => void;
};

export const usePrStatusStore = create<State & Actions>()((set) => ({
	byPath: {},
	set: (repoPath, status) => set((s) => ({ byPath: { ...s.byPath, [repoPath]: status } })),
}));
