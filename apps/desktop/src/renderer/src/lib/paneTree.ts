export type Orientation = "horizontal" | "vertical";

export type Leaf = { kind: "leaf"; id: string; cwd?: string };
export type Split = {
	kind: "split";
	id: string;
	orientation: Orientation;
	children: Pane[];
};
export type Pane = Leaf | Split;

let counter = 0;
export const nextPaneId = (prefix: string): string => `${prefix}-${++counter}`;

export const makeLeaf = (cwd?: string): Leaf => ({
	kind: "leaf",
	id: nextPaneId("leaf"),
	cwd,
});

export const splitLeaf = (
	tree: Pane,
	leafId: string,
	orientation: Orientation,
	newCwd?: string,
): Pane => {
	if (tree.kind === "leaf") {
		if (tree.id !== leafId) return tree;
		return {
			kind: "split",
			id: nextPaneId("split"),
			orientation,
			children: [tree, makeLeaf(newCwd)],
		};
	}
	return {
		...tree,
		children: tree.children.map((c) => splitLeaf(c, leafId, orientation, newCwd)),
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
