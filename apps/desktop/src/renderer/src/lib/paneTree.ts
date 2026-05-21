export type Orientation = "horizontal" | "vertical";

export type Leaf = { kind: "leaf"; id: string; cwd?: string };
export type Split = {
	kind: "split";
	id: string;
	orientation: Orientation;
	children: Pane[];
};
export type Pane = Leaf | Split;

// UUIDs avoid collisions when the renderer reloads with a persisted tree:
// a module-level counter would reset to 0 while leaves like `leaf-7` survive,
// so the next split would eventually mint a colliding id.
export const nextPaneId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

export const makeLeaf = (cwd?: string): Leaf => ({
	kind: "leaf",
	id: nextPaneId("leaf"),
	cwd,
});

export const splitLeaf = (
	tree: Pane,
	leafId: string,
	orientation: Orientation,
	newLeaf: Leaf,
): Pane => {
	if (tree.kind === "leaf") {
		if (tree.id !== leafId) return tree;
		return {
			kind: "split",
			id: nextPaneId("split"),
			orientation,
			children: [tree, newLeaf],
		};
	}
	return {
		...tree,
		children: tree.children.map((c) => splitLeaf(c, leafId, orientation, newLeaf)),
	};
};

export const removeLeaf = (tree: Pane, leafId: string): Pane | null => {
	if (tree.kind === "leaf") {
		return tree.id === leafId ? null : tree;
	}
	const filtered = tree.children
		.map((c) => removeLeaf(c, leafId))
		.filter((c): c is Pane => c !== null);
	if (filtered.length === 0) return null;
	if (filtered.length === 1) return filtered[0];
	return { ...tree, children: filtered };
};

export const collectLeafIds = (tree: Pane): string[] => {
	if (tree.kind === "leaf") return [tree.id];
	return tree.children.flatMap(collectLeafIds);
};

export type PathStep = { split: Split; childIndex: number };

/**
 * Walk from `tree` down to the leaf with `leafId`. Returns the sequence of
 * (parent split, child index) steps along the path. Empty path means the leaf
 * is the root (no parent splits exist).
 */
export const pathToLeaf = (tree: Pane, leafId: string): PathStep[] | null => {
	if (tree.kind === "leaf") {
		return tree.id === leafId ? [] : null;
	}
	for (let i = 0; i < tree.children.length; i++) {
		const child = tree.children[i];
		const sub = pathToLeaf(child, leafId);
		if (sub !== null) return [{ split: tree, childIndex: i }, ...sub];
	}
	return null;
};
