import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { playCue } from "@/lib/activitySounds";
import type { Pane } from "@/lib/paneTree";
import { STUCK_MIN_MS, useActivityStore } from "@/stores/activity";
import { useTabsStore } from "@/stores/tabs";

// Mock the cue synth: no AudioContext under node, and it lets us assert that a
// reconcile (a correction) never chimes the way a real hook event would.
vi.mock("@/lib/activitySounds", () => ({ playCue: vi.fn() }));

const WS = "ws-test";

const singleLeaf = (leafId: string): Pane => ({ kind: "leaf", id: leafId });
const splitOf = (leafIds: string[]): Pane => ({
	kind: "split",
	id: "split-test",
	orientation: "horizontal",
	children: leafIds.map((id) => ({ kind: "leaf", id })),
});

// Put one tab (with the given pane tree) under WS so findWorkspaceForLeaf and the
// reconcile fold can see the leaves.
const seedWorkspace = (tree: Pane, activeLeafId: string | null = null): void => {
	useTabsStore.setState({
		byWorkspace: {
			[WS]: { tabs: [{ id: "tab1", title: "t", tree, activeLeafId }], activeTabId: "tab1" },
		},
	});
};

const statusOf = (leafId: string): string =>
	useActivityStore.getState().leafStatus[leafId] ?? "idle";
const wsStatus = (): string => useActivityStore.getState().workspaceStatus[WS] ?? "idle";

// Make isLeafFocused(...) true: app focused and viewing WS/tab1. The renderer
// globals don't exist under node, so the focus-guard is otherwise inert.
const stubFocusedOn = (hash: string): void => {
	const g = globalThis as unknown as Record<string, unknown>;
	g.document = { hasFocus: () => true, hidden: false };
	g.window = { location: { hash } };
};
const clearGlobals = (): void => {
	const g = globalThis as unknown as Record<string, unknown>;
	delete g.document;
	delete g.window;
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
	useActivityStore.setState({ signals: {}, leafStatus: {}, workspaceStatus: {} });
	useTabsStore.setState({ byWorkspace: {} });
	vi.mocked(playCue).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
	clearGlobals();
});

describe("reconcileWorkspace", () => {
	it("clears a stuck 'working' when claude is gone past the grace floor (the headline bug)", () => {
		seedWorkspace(singleLeaf("a1"));
		useActivityStore.getState().applyHook("a1", "working");
		expect(statusOf("a1")).toBe("working");

		vi.setSystemTime(STUCK_MIN_MS + 1);
		useActivityStore.getState().reconcileWorkspace(WS, { a1: { claudePresent: false } });

		expect(statusOf("a1")).toBe("idle");
		expect(wsStatus()).toBe("idle");
	});

	it("does NOT clear a fresh 'working' within the grace floor, even if claude looks absent", () => {
		seedWorkspace(singleLeaf("a2"));
		useActivityStore.getState().applyHook("a2", "working");

		vi.setSystemTime(STUCK_MIN_MS - 1);
		useActivityStore.getState().reconcileWorkspace(WS, { a2: { claudePresent: false } });

		expect(statusOf("a2")).toBe("working");
	});

	it("leaves a latched 'done' untouched when claude is gone", () => {
		seedWorkspace(singleLeaf("a3"));
		useActivityStore.getState().applyHook("a3", "done");
		expect(statusOf("a3")).toBe("done");

		vi.setSystemTime(STUCK_MIN_MS + 1);
		useActivityStore.getState().reconcileWorkspace(WS, { a3: { claudePresent: false } });

		expect(statusOf("a3")).toBe("done");
	});

	it("clears a stuck 'needs-attention' when claude is gone past the grace floor", () => {
		seedWorkspace(singleLeaf("n1"));
		useActivityStore.getState().applyHook("n1", "attention");
		expect(statusOf("n1")).toBe("needs-attention");

		vi.setSystemTime(STUCK_MIN_MS + 1);
		useActivityStore.getState().reconcileWorkspace(WS, { n1: { claudePresent: false } });

		expect(statusOf("n1")).toBe("idle");
	});

	it("restores 'working' when claude is alive and the spinner is painting (teleport drop)", () => {
		seedWorkspace(singleLeaf("b1"));
		// Post-teleport state: a hook turn was seen, turnActive got dropped, but the
		// byte-path spinner shows claude is still generating.
		useActivityStore.setState({
			signals: {
				b1: {
					hookSeen: true,
					turnActive: false,
					attention: false,
					done: false,
					byteWorking: true,
				},
			},
			leafStatus: { b1: "idle" },
			workspaceStatus: { [WS]: "idle" },
		});

		useActivityStore.getState().reconcileWorkspace(WS, { b1: { claudePresent: true } });

		expect(statusOf("b1")).toBe("working");
		expect(wsStatus()).toBe("working");
	});

	it("leaves a byte-path-only 'working' (no hooks) as working when claude is present", () => {
		seedWorkspace(singleLeaf("b2"));
		useActivityStore.getState().setByteWorking("b2", true);
		expect(statusOf("b2")).toBe("working");

		useActivityStore.getState().reconcileWorkspace(WS, { b2: { claudePresent: true } });

		expect(statusOf("b2")).toBe("working");
	});

	it("resolves a lost Stop to 'done' (claude alive, spinner long gone, turn never closed)", () => {
		seedWorkspace(singleLeaf("c1"));
		useActivityStore.getState().applyHook("c1", "working"); // hookSeen + turnActive, no spinner

		vi.setSystemTime(STUCK_MIN_MS + 1);
		useActivityStore.getState().reconcileWorkspace(WS, { c1: { claudePresent: true } });

		expect(statusOf("c1")).toBe("done");
	});

	it("does NOT resolve to 'done' while the spinner is still painting", () => {
		seedWorkspace(singleLeaf("c2"));
		useActivityStore.getState().applyHook("c2", "working");
		useActivityStore.getState().setByteWorking("c2", true);

		vi.setSystemTime(STUCK_MIN_MS + 1);
		useActivityStore.getState().reconcileWorkspace(WS, { c2: { claudePresent: true } });

		expect(statusOf("c2")).toBe("working");
	});

	it("a correction on the focused pane resolves to idle, not a latched done", () => {
		seedWorkspace(singleLeaf("f1"), "f1");
		stubFocusedOn(`#/workspaces/${WS}/tabs/tab1`);
		useActivityStore.getState().applyHook("f1", "working");

		vi.setSystemTime(STUCK_MIN_MS + 1);
		// Rule C would set 'done', but you're looking at this pane, so it clears.
		useActivityStore.getState().reconcileWorkspace(WS, { f1: { claudePresent: true } });

		expect(statusOf("f1")).toBe("idle");
	});

	it("does not chime when a reconcile produces 'done' (it is a correction, not an event)", () => {
		seedWorkspace(singleLeaf("g1"));
		useActivityStore.getState().applyHook("g1", "working");
		vi.setSystemTime(STUCK_MIN_MS + 1);
		vi.mocked(playCue).mockClear();

		useActivityStore.getState().reconcileWorkspace(WS, { g1: { claudePresent: true } });
		expect(statusOf("g1")).toBe("done");
		expect(playCue).not.toHaveBeenCalled();

		// Sanity: the same 'done' delivered as a real hook event DOES chime, so the
		// assertion above is meaningful (the mock is wired and fires on the normal path).
		seedWorkspace(singleLeaf("g2"));
		useActivityStore.getState().applyHook("g2", "done");
		expect(playCue).toHaveBeenCalledTimes(1);
	});

	it("folds mixed per-leaf corrections into the workspace's highest-priority status", () => {
		seedWorkspace(splitOf(["m1", "m2"]));
		useActivityStore.getState().applyHook("m1", "working"); // claude gone → cleared
		useActivityStore.getState().applyHook("m2", "done"); // claude alive, no turn → stays done

		vi.setSystemTime(STUCK_MIN_MS + 1);
		useActivityStore.getState().reconcileWorkspace(WS, {
			m1: { claudePresent: false },
			m2: { claudePresent: true },
		});

		expect(statusOf("m1")).toBe("idle");
		expect(statusOf("m2")).toBe("done");
		expect(wsStatus()).toBe("done");
	});

	it("leaves a leaf with no liveness probe result untouched", () => {
		seedWorkspace(singleLeaf("u1"));
		useActivityStore.getState().applyHook("u1", "working");

		vi.setSystemTime(STUCK_MIN_MS + 1);
		useActivityStore.getState().reconcileWorkspace(WS, {}); // no entry for u1

		expect(statusOf("u1")).toBe("working");
	});

	it("is idempotent: a second reconcile with the same liveness makes no further change", () => {
		seedWorkspace(singleLeaf("i1"));
		useActivityStore.getState().applyHook("i1", "working");
		vi.setSystemTime(STUCK_MIN_MS + 1);

		const liveness = { i1: { claudePresent: false } };
		useActivityStore.getState().reconcileWorkspace(WS, liveness);
		expect(statusOf("i1")).toBe("idle");

		const snapshot = JSON.stringify(useActivityStore.getState().signals.i1);
		useActivityStore.getState().reconcileWorkspace(WS, liveness);
		expect(JSON.stringify(useActivityStore.getState().signals.i1)).toBe(snapshot);
		expect(statusOf("i1")).toBe("idle");
	});
});
