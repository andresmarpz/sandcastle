import { getPanelGroup } from "@/lib/panelGroupRegistry";
import { type Pane, pathToLeaf } from "@/lib/paneTree";
import { focusTerminal } from "@/lib/terminalRegistry";

export type Direction = "up" | "down" | "left" | "right";

const RESIZE_STEP_PCT = 5;

/**
 * Return the leaf id of the currently focused pane, or null if focus isn't
 * inside any pane (e.g. focus is on the sidebar or top bar). Walks up from
 * `document.activeElement` looking for the `data-leaf-id` marker that LeafPane
 * stamps on its wrapper.
 */
export const getFocusedLeafId = (): string | null => {
	const active = document.activeElement;
	if (!(active instanceof Element)) return null;
	const wrapper = active.closest<HTMLElement>("[data-leaf-id]");
	return wrapper?.dataset.leafId ?? null;
};

const rectCenter = (r: DOMRect): { x: number; y: number } => ({
	x: r.left + r.width / 2,
	y: r.top + r.height / 2,
});

/**
 * Find the leaf id of the pane nearest to `fromLeafId` in `dir`, using DOM
 * geometry. We measure axis-aligned distance to the candidate's near edge plus
 * a small cross-axis penalty so that a directly-aligned neighbor beats one
 * that's only diagonally nearby.
 */
export const findPaneInDirection = (fromLeafId: string, dir: Direction): string | null => {
	const fromEl = document.querySelector<HTMLElement>(`[data-leaf-id="${fromLeafId}"]`);
	if (!fromEl) return null;
	const fromRect = fromEl.getBoundingClientRect();
	const fromCenter = rectCenter(fromRect);

	const candidates = document.querySelectorAll<HTMLElement>("[data-leaf-id]");
	let bestId: string | null = null;
	let bestScore = Infinity;

	for (const el of candidates) {
		const id = el.dataset.leafId;
		if (!id || id === fromLeafId) continue;
		const r = el.getBoundingClientRect();
		const c = rectCenter(r);

		let primary: number;
		let cross: number;
		switch (dir) {
			case "up":
				if (r.bottom > fromRect.top + 1) continue;
				primary = fromRect.top - r.bottom;
				cross = Math.abs(c.x - fromCenter.x);
				break;
			case "down":
				if (r.top < fromRect.bottom - 1) continue;
				primary = r.top - fromRect.bottom;
				cross = Math.abs(c.x - fromCenter.x);
				break;
			case "left":
				if (r.right > fromRect.left + 1) continue;
				primary = fromRect.left - r.right;
				cross = Math.abs(c.y - fromCenter.y);
				break;
			case "right":
				if (r.left < fromRect.right - 1) continue;
				primary = r.left - fromRect.right;
				cross = Math.abs(c.y - fromCenter.y);
				break;
		}
		// Primary distance dominates; cross-axis offset breaks ties so that an
		// aligned neighbor wins over a misaligned one at the same depth.
		const score = primary + cross * 2;
		if (score < bestScore) {
			bestScore = score;
			bestId = id;
		}
	}
	return bestId;
};

export const focusPaneInDirection = (dir: Direction): boolean => {
	const focused = getFocusedLeafId();
	if (!focused) return false;
	const target = findPaneInDirection(focused, dir);
	if (!target) return false;
	focusTerminal(target);
	return true;
};

const directionAxis = (dir: Direction): "horizontal" | "vertical" =>
	dir === "left" || dir === "right" ? "horizontal" : "vertical";

/**
 * Resize the focused pane in `dir`. Walks from the focused leaf up the pane
 * tree, finds the nearest ancestor split whose orientation matches the arrow
 * axis AND where the focused-containing child has a sibling on the side the
 * arrow points to. Then shifts RESIZE_STEP_PCT between the two via the
 * react-resizable-panels imperative API.
 *
 * "Grow direction" semantics: pressing the arrow moves the boundary in that
 * direction — so Cmd+Shift+Right grows the focused pane to the right (or, if
 * the focused pane is the right-most child of a horizontal split, climbs to
 * the next horizontal ancestor where there's still room).
 */
export const resizePaneInDirection = (tree: Pane, dir: Direction): boolean => {
	const focused = getFocusedLeafId();
	if (!focused) return false;
	const path = pathToLeaf(tree, focused);
	if (!path || path.length === 0) return false;

	const axis = directionAxis(dir);
	const growsToHigherIndex = dir === "right" || dir === "down";

	for (let i = path.length - 1; i >= 0; i--) {
		const { split, childIndex } = path[i];
		if (split.orientation !== axis) continue;
		const siblingIndex = growsToHigherIndex ? childIndex + 1 : childIndex - 1;
		if (siblingIndex < 0 || siblingIndex >= split.children.length) continue;

		const handle = getPanelGroup(split.id);
		if (!handle) return false;
		const layout = handle.getLayout();
		if (layout.length !== split.children.length) return false;

		const focusedSize = layout[childIndex];
		const siblingSize = layout[siblingIndex];
		// Don't pull a sibling below its 10% minSize (matches ResizablePanel's
		// minSize prop). Without this the call no-ops silently and the user
		// thinks the keybind is broken.
		const step = Math.min(RESIZE_STEP_PCT, siblingSize - 10);
		if (step <= 0) return false;

		const next = layout.slice();
		next[childIndex] = focusedSize + step;
		next[siblingIndex] = siblingSize - step;
		handle.setLayout(next);
		return true;
	}
	return false;
};
