import type { WorkspaceId } from "@sandcastle/contracts";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { makeLeaf, type Pane } from "@/lib/paneTree";

export type TabId = string;

export type Tab = {
	id: TabId;
	title: string;
	tree: Pane;
	activeLeafId: string | null;
};

export type WorkspaceTabsState = {
	tabs: Tab[];
	activeTabId: TabId | null;
};

type State = {
	byWorkspace: Record<string, WorkspaceTabsState>;
};

type Actions = {
	getWorkspace: (wsId: WorkspaceId) => WorkspaceTabsState;
	ensureTab: (wsId: WorkspaceId, cwd: string) => TabId;
	createTab: (wsId: WorkspaceId, cwd: string) => TabId;
	closeTab: (wsId: WorkspaceId, tabId: TabId) => TabId | null;
	setActiveTab: (wsId: WorkspaceId, tabId: TabId) => void;
	setActiveLeaf: (wsId: WorkspaceId, tabId: TabId, leafId: string) => void;
	renameTab: (wsId: WorkspaceId, tabId: TabId, title: string) => void;
	updateTree: (wsId: WorkspaceId, tabId: TabId, updater: (tree: Pane) => Pane) => void;
	/**
	 * Move a whole tab (and its live terminals) from one workspace to another.
	 * Leaf ids are global UUIDs and terminals are tracked by leafId in the
	 * registry, so the running PTYs survive untouched — this just re-files the
	 * tab under a different workspace key. Powers MCP worktree teleport.
	 */
	moveTabToWorkspace: (fromWs: WorkspaceId, tabId: TabId, toWs: WorkspaceId) => boolean;
};

let tabCounter = 0;
const nextTabId = (): TabId => `tab-${Date.now().toString(36)}-${++tabCounter}`;

const defaultTitle = (existing: readonly Tab[]): string => {
	const used = new Set<number>();
	for (const t of existing) {
		const match = /^Tab (\d+)$/.exec(t.title);
		if (match) used.add(Number(match[1]));
	}
	let n = 1;
	while (used.has(n)) n++;
	return `Tab ${n}`;
};

export const useTabsStore = create<State & Actions>()(
	persist(
		(set, get) => ({
			byWorkspace: {},

			getWorkspace: (wsId) => get().byWorkspace[wsId as string] ?? { tabs: [], activeTabId: null },

			ensureTab: (wsId, cwd) => {
				const key = wsId as string;
				const current = get().byWorkspace[key];
				if (current && current.tabs.length > 0) {
					return current.activeTabId ?? current.tabs[0].id;
				}
				return get().createTab(wsId, cwd);
			},

			createTab: (wsId, cwd) => {
				const key = wsId as string;
				const id = nextTabId();
				const rootLeaf = makeLeaf(cwd);
				set((s) => {
					const existing = s.byWorkspace[key] ?? { tabs: [], activeTabId: null };
					const tab: Tab = {
						id,
						title: defaultTitle(existing.tabs),
						tree: rootLeaf,
						activeLeafId: rootLeaf.id,
					};
					return {
						byWorkspace: {
							...s.byWorkspace,
							[key]: {
								tabs: [...existing.tabs, tab],
								activeTabId: id,
							},
						},
					};
				});
				return id;
			},

			closeTab: (wsId, tabId) => {
				const key = wsId as string;
				const current = get().byWorkspace[key];
				if (!current) return null;
				const idx = current.tabs.findIndex((t) => t.id === tabId);
				if (idx < 0) return current.activeTabId;
				const nextTabs = current.tabs.filter((t) => t.id !== tabId);
				let nextActive: TabId | null = current.activeTabId;
				if (current.activeTabId === tabId) {
					if (nextTabs.length === 0) {
						nextActive = null;
					} else {
						const fallbackIdx = Math.min(idx, nextTabs.length - 1);
						nextActive = nextTabs[fallbackIdx].id;
					}
				}
				set((s) => ({
					byWorkspace: {
						...s.byWorkspace,
						[key]: { tabs: nextTabs, activeTabId: nextActive },
					},
				}));
				return nextActive;
			},

			setActiveTab: (wsId, tabId) => {
				const key = wsId as string;
				set((s) => {
					const existing = s.byWorkspace[key];
					if (!existing) return s;
					if (!existing.tabs.some((t) => t.id === tabId)) return s;
					if (existing.activeTabId === tabId) return s;
					return {
						byWorkspace: {
							...s.byWorkspace,
							[key]: { ...existing, activeTabId: tabId },
						},
					};
				});
			},

			setActiveLeaf: (wsId, tabId, leafId) => {
				const key = wsId as string;
				set((s) => {
					const existing = s.byWorkspace[key];
					if (!existing) return s;
					const tab = existing.tabs.find((t) => t.id === tabId);
					if (!tab) return s;
					if (tab.activeLeafId === leafId) return s;
					return {
						byWorkspace: {
							...s.byWorkspace,
							[key]: {
								...existing,
								tabs: existing.tabs.map((t) =>
									t.id === tabId ? { ...t, activeLeafId: leafId } : t,
								),
							},
						},
					};
				});
			},

			renameTab: (wsId, tabId, title) => {
				const key = wsId as string;
				set((s) => {
					const existing = s.byWorkspace[key];
					if (!existing) return s;
					return {
						byWorkspace: {
							...s.byWorkspace,
							[key]: {
								...existing,
								tabs: existing.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
							},
						},
					};
				});
			},

			updateTree: (wsId, tabId, updater) => {
				const key = wsId as string;
				set((s) => {
					const existing = s.byWorkspace[key];
					if (!existing) return s;
					return {
						byWorkspace: {
							...s.byWorkspace,
							[key]: {
								...existing,
								tabs: existing.tabs.map((t) =>
									t.id === tabId ? { ...t, tree: updater(t.tree) } : t,
								),
							},
						},
					};
				});
			},

			moveTabToWorkspace: (fromWs, tabId, toWs) => {
				const fromKey = fromWs as string;
				const toKey = toWs as string;
				if (fromKey === toKey) return false;
				const from = get().byWorkspace[fromKey];
				const idx = from?.tabs.findIndex((t) => t.id === tabId) ?? -1;
				if (!from || idx < 0) return false;
				const tab = from.tabs[idx];

				set((s) => {
					const src = s.byWorkspace[fromKey];
					if (!src) return s;
					const srcTabs = src.tabs.filter((t) => t.id !== tabId);
					let srcActive: TabId | null = src.activeTabId;
					if (srcActive === tabId) {
						srcActive = srcTabs.length === 0 ? null : srcTabs[Math.min(idx, srcTabs.length - 1)].id;
					}
					const dst = s.byWorkspace[toKey] ?? { tabs: [], activeTabId: null };
					// Idempotent: if the tab is somehow already in the destination, just
					// focus it rather than duplicating.
					const dstTabs = dst.tabs.some((t) => t.id === tabId) ? dst.tabs : [...dst.tabs, tab];
					return {
						byWorkspace: {
							...s.byWorkspace,
							[fromKey]: { tabs: srcTabs, activeTabId: srcActive },
							[toKey]: { tabs: dstTabs, activeTabId: tabId },
						},
					};
				});
				return true;
			},
		}),
		{
			name: "sandcastle.tabs.v1",
			partialize: (s) => ({ byWorkspace: s.byWorkspace }),
		},
	),
);
