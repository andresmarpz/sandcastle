import type { WorkspaceId } from "@sandcastle/contracts";
import { Columns2, Rows2, X } from "lucide-react";
import { Fragment, useCallback } from "react";

import { disposeTerminal, getTerminalCwd } from "@/lib/terminalRegistry";
import {
	type Leaf,
	makeLeaf,
	type Orientation,
	type Pane,
	removeLeaf,
	splitLeaf,
} from "@/lib/paneTree";
import { type TabId, useTabsStore } from "@/stores/tabs";

import Terminal from "./Terminal";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";

export type Corners = { tl: boolean; tr: boolean; bl: boolean; br: boolean };
export type Edges = { t: boolean; r: boolean; b: boolean; l: boolean };
const ALL_CORNERS: Corners = { tl: true, tr: true, bl: true, br: true };
const ALL_EDGES: Edges = { t: true, r: true, b: true, l: true };

type LeafProps = {
	leaf: Leaf;
	corners: Corners;
	edges: Edges;
	onSplit: (id: string, orientation: Orientation) => void;
	onClose: (id: string) => void;
	canClose: boolean;
};

function LeafPane({
	leaf,
	corners,
	edges,
	onSplit,
	onClose,
	canClose,
}: LeafProps): React.JSX.Element {
	const handleKeyDown = (e: React.KeyboardEvent): void => {
		const mod = e.metaKey || e.ctrlKey;
		if (!mod) return;
		const key = e.key.toLowerCase();
		if (key === "d" && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			onSplit(leaf.id, "horizontal");
		} else if (key === "d" && e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			onSplit(leaf.id, "vertical");
		} else if (key === "w") {
			if (!canClose) return;
			e.preventDefault();
			e.stopPropagation();
			onClose(leaf.id);
		}
	};

	return (
		<div className="group relative h-full w-full" onKeyDownCapture={handleKeyDown}>
			<Terminal
				leafId={leaf.id}
				cwd={leaf.cwd}
				corners={corners}
				edges={edges}
				className="h-full w-full"
			/>
			<div className="pointer-events-none absolute top-1.5 right-1.5 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
				<button
					type="button"
					title="Split right (⌘D)"
					onClick={() => onSplit(leaf.id, "horizontal")}
					className="pointer-events-auto rounded border border-border bg-background/70 p-1 text-muted-foreground backdrop-blur-sm hover:bg-background hover:text-foreground"
				>
					<Columns2 size={12} />
				</button>
				<button
					type="button"
					title="Split down (⇧⌘D)"
					onClick={() => onSplit(leaf.id, "vertical")}
					className="pointer-events-auto rounded border border-border bg-background/70 p-1 text-muted-foreground backdrop-blur-sm hover:bg-background hover:text-foreground"
				>
					<Rows2 size={12} />
				</button>
				{canClose && (
					<button
						type="button"
						title="Close pane (⌘W)"
						onClick={() => onClose(leaf.id)}
						className="pointer-events-auto rounded border border-border bg-background/70 p-1 text-muted-foreground backdrop-blur-sm hover:border-destructive/40 hover:bg-destructive/15 hover:text-destructive"
					>
						<X size={12} />
					</button>
				)}
			</div>
		</div>
	);
}

type RenderCtx = {
	onSplit: (id: string, orientation: Orientation) => void;
	onClose: (id: string) => void;
	rootIsLeaf: boolean;
};

function renderPane(node: Pane, ctx: RenderCtx, corners: Corners, edges: Edges): React.ReactNode {
	if (node.kind === "leaf") {
		return (
			<LeafPane
				leaf={node}
				corners={corners}
				edges={edges}
				onSplit={ctx.onSplit}
				onClose={ctx.onClose}
				canClose={!ctx.rootIsLeaf}
			/>
		);
	}
	const isHorizontal = node.orientation === "horizontal";
	const lastIdx = node.children.length - 1;
	return (
		<ResizablePanelGroup orientation={node.orientation} id={node.id} className="overflow-visible!">
			{node.children.map((child, i) => {
				const isFirst = i === 0;
				const isLast = i === lastIdx;
				const childCorners: Corners = isHorizontal
					? {
							tl: corners.tl && isFirst,
							bl: corners.bl && isFirst,
							tr: corners.tr && isLast,
							br: corners.br && isLast,
						}
					: {
							tl: corners.tl && isFirst,
							tr: corners.tr && isFirst,
							bl: corners.bl && isLast,
							br: corners.br && isLast,
						};
				const childEdges: Edges = isHorizontal
					? {
							t: edges.t,
							b: edges.b,
							l: edges.l && isFirst,
							r: edges.r && isLast,
						}
					: {
							t: edges.t && isFirst,
							b: edges.b && isLast,
							l: edges.l,
							r: edges.r,
						};
				return (
					<Fragment key={child.id}>
						{i > 0 && <ResizableHandle />}
						<ResizablePanel
							id={child.id}
							defaultSize={100 / node.children.length}
							minSize={10}
							className="overflow-visible!"
						>
							{renderPane(child, ctx, childCorners, childEdges)}
						</ResizablePanel>
					</Fragment>
				);
			})}
		</ResizablePanelGroup>
	);
}

type Props = {
	workspaceId: WorkspaceId;
	tabId: TabId;
	defaultCwd: string;
};

function PaneTree({ workspaceId, tabId, defaultCwd }: Props): React.JSX.Element | null {
	const tree = useTabsStore((s) =>
		s.byWorkspace[workspaceId as string]?.tabs.find((t) => t.id === tabId)?.tree,
	);
	const updateTree = useTabsStore((s) => s.updateTree);

	const handleSplit = useCallback(
		async (id: string, orientation: Orientation): Promise<void> => {
			const cwd = (await getTerminalCwd(id)) ?? defaultCwd;
			updateTree(workspaceId, tabId, (t) => splitLeaf(t, id, orientation, cwd));
		},
		[workspaceId, tabId, defaultCwd, updateTree],
	);

	const handleClose = useCallback(
		(id: string): void => {
			disposeTerminal(id);
			updateTree(workspaceId, tabId, (t) => {
				const next = removeLeaf(t, id);
				if (next === null) return makeLeaf(defaultCwd);
				return next;
			});
		},
		[workspaceId, tabId, defaultCwd, updateTree],
	);

	if (!tree) return null;

	const ctx: RenderCtx = {
		onSplit: handleSplit,
		onClose: handleClose,
		rootIsLeaf: tree.kind === "leaf",
	};

	return <div className="h-full w-full">{renderPane(tree, ctx, ALL_CORNERS, ALL_EDGES)}</div>;
}

export default PaneTree;
