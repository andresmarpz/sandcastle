import type { WorkspaceId } from "@sandcastle/contracts";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { makeLeaf, type Pane } from "@/lib/paneTree";

export type TabId = string;

export type Tab = {
	id: TabId;
	title: string;
	tree: Pane;
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
	renameTab: (wsId: WorkspaceId, tabId: TabId, title: string) => void;
	updateTree: (wsId: WorkspaceId, tabId: TabId, updater: (tree: Pane) => Pane) => void;
};

let tabCounter = 0;
const nextTabId = (): TabId => `tab-${Date.now().toString(36)}-${++tabCounter}`;

const defaultTitle = (cwd: string): string => {
	const parts = cwd.split(/[/\\]/).filter(Boolean);
	return parts[parts.length - 1] ?? "Tab";
};

export const useTabsStore = create<State & Actions>()(
	persist(
		(set, get) => ({
			byWorkspace: {},

			getWorkspace: (wsId) =>
				get().byWorkspace[wsId as string] ?? { tabs: [], activeTabId: null },

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
				const tab: Tab = {
					id,
					title: defaultTitle(cwd),
					tree: makeLeaf(cwd),
				};
				set((s) => {
					const existing = s.byWorkspace[key] ?? { tabs: [], activeTabId: null };
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
					return {
						byWorkspace: {
							...s.byWorkspace,
							[key]: { ...existing, activeTabId: tabId },
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
		}),
		{
			name: "sandcastle.tabs.v1",
			partialize: (s) => ({ byWorkspace: s.byWorkspace }),
		},
	),
);
