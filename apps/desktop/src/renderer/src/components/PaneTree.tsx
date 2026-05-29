import type { WorkspaceId } from "@sandcastle/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Columns2, Rows2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef } from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";

import { registerPanelGroup, unregisterPanelGroup } from "@/lib/panelGroupRegistry";
import {
	collectLeafIds,
	type Leaf,
	makeLeaf,
	type Orientation,
	type Pane,
	removeLeaf,
	splitLeaf,
} from "@/lib/paneTree";
import { disposeTerminal, getTeleportedCwd, getTerminalCwd } from "@/lib/terminalRegistry";
import { type TabId, useTabsStore } from "@/stores/tabs";

import Terminal from "./Terminal";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";

export type Corners = { tl: boolean; tr: boolean; bl: boolean; br: boolean };
const ALL_CORNERS: Corners = { tl: true, tr: true, bl: true, br: true };

type LeafProps = {
	leaf: Leaf;
	corners: Corners;
	workspaceId: WorkspaceId;
	onSplit: (id: string, orientation: Orientation) => void;
	onClose: (id: string) => void;
	onFocus: (id: string) => void;
	canClose: boolean;
};

function LeafPane({
	leaf,
	corners,
	workspaceId,
	onSplit,
	onClose,
	onFocus,
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
			// Always swallow Cmd+W and delegate to onClose — the handler decides
			// whether to close the pane, the tab, or the window.
			e.preventDefault();
			e.stopPropagation();
			onClose(leaf.id);
		}
	};

	return (
		<div
			data-leaf-id={leaf.id}
			className="group relative h-full w-full"
			onKeyDownCapture={handleKeyDown}
			onFocusCapture={() => onFocus(leaf.id)}
		>
			<Terminal
				leafId={leaf.id}
				cwd={leaf.cwd}
				workspaceId={workspaceId as string}
				corners={corners}
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
	workspaceId: WorkspaceId;
	onSplit: (id: string, orientation: Orientation) => void;
	onClose: (id: string) => void;
	onFocus: (id: string) => void;
	rootIsLeaf: boolean;
};

type SplitProps = {
	node: Extract<Pane, { kind: "split" }>;
	ctx: RenderCtx;
	corners: Corners;
};

function SplitPane({ node, ctx, corners }: SplitProps): React.JSX.Element {
	const isHorizontal = node.orientation === "horizontal";
	const lastIdx = node.children.length - 1;
	const groupRef = useRef<GroupImperativeHandle | null>(null);

	useEffect(() => {
		const handle = groupRef.current;
		if (!handle) return;
		registerPanelGroup(node.id, handle);
		return () => unregisterPanelGroup(node.id);
	}, [node.id]);

	return (
		<ResizablePanelGroup
			groupRef={groupRef}
			orientation={node.orientation}
			id={node.id}
			className="overflow-visible!"
		>
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
				return (
					<Fragment key={child.id}>
						{i > 0 && <ResizableHandle />}
						<ResizablePanel
							id={child.id}
							defaultSize={100 / node.children.length}
							minSize={10}
							className="overflow-visible!"
						>
							{renderPane(child, ctx, childCorners)}
						</ResizablePanel>
					</Fragment>
				);
			})}
		</ResizablePanelGroup>
	);
}

function renderPane(node: Pane, ctx: RenderCtx, corners: Corners): React.ReactNode {
	if (node.kind === "leaf") {
		return (
			<LeafPane
				leaf={node}
				corners={corners}
				workspaceId={ctx.workspaceId}
				onSplit={ctx.onSplit}
				onClose={ctx.onClose}
				onFocus={ctx.onFocus}
				canClose={!ctx.rootIsLeaf}
			/>
		);
	}
	return <SplitPane node={node} ctx={ctx} corners={corners} />;
}

type Props = {
	workspaceId: WorkspaceId;
	tabId: TabId;
	defaultCwd: string;
};

function PaneTree({ workspaceId, tabId, defaultCwd }: Props): React.JSX.Element | null {
	const navigate = useNavigate();
	const tabs = useTabsStore((s) => s.byWorkspace[workspaceId as string]?.tabs);
	const tree = tabs?.find((t) => t.id === tabId)?.tree;
	const updateTree = useTabsStore((s) => s.updateTree);
	const closeTab = useTabsStore((s) => s.closeTab);
	const setActiveLeaf = useTabsStore((s) => s.setActiveLeaf);

	const handleSplit = useCallback(
		async (id: string, orientation: Orientation): Promise<void> => {
			// A teleported pane's shell still sits in its origin dir, so prefer the
			// teleport destination over the live PTY cwd (see setTeleportedCwd).
			const cwd = getTeleportedCwd(id) ?? (await getTerminalCwd(id)) ?? defaultCwd;
			const newLeaf = makeLeaf(cwd);
			updateTree(workspaceId, tabId, (t) => splitLeaf(t, id, orientation, newLeaf));
			setActiveLeaf(workspaceId, tabId, newLeaf.id);
		},
		[workspaceId, tabId, defaultCwd, updateTree, setActiveLeaf],
	);

	const handleFocus = useCallback(
		(id: string): void => {
			setActiveLeaf(workspaceId, tabId, id);
		},
		[workspaceId, tabId, setActiveLeaf],
	);

	const handleClose = useCallback(
		(id: string): void => {
			if (!tree) return;
			const leafIds = collectLeafIds(tree);
			// Multiple panes in the tab: just close this one. State first, then
			// teardown — if disposeTerminal ever throws, we've already removed the
			// leaf from the tree so the pane disappears rather than getting stuck.
			if (leafIds.length > 1) {
				let fallbackLeafId: string | null = null;
				updateTree(workspaceId, tabId, (t) => {
					const next = removeLeaf(t, id);
					if (next === null) {
						const replacement = makeLeaf(defaultCwd);
						fallbackLeafId = replacement.id;
						return replacement;
					}
					fallbackLeafId = collectLeafIds(next)[0] ?? null;
					return next;
				});
				if (fallbackLeafId) setActiveLeaf(workspaceId, tabId, fallbackLeafId);
				disposeTerminal(id);
				return;
			}
			// Last pane in the tab: escalate. Close the tab — and if it was the
			// last tab in the workspace, close the window.
			const wasLastTab = (tabs?.length ?? 0) <= 1;
			const nextActive = closeTab(workspaceId, tabId);
			for (const leafId of leafIds) disposeTerminal(leafId);
			if (wasLastTab) {
				window.api.window.close();
				return;
			}
			if (nextActive) {
				void navigate({
					to: "/workspaces/$wsId/tabs/$tabId",
					params: { wsId: workspaceId as string, tabId: nextActive },
				});
			} else {
				void navigate({
					to: "/workspaces/$wsId",
					params: { wsId: workspaceId as string },
				});
			}
		},
		[workspaceId, tabId, defaultCwd, tree, tabs, updateTree, closeTab, setActiveLeaf, navigate],
	);

	if (!tree) return null;

	const ctx: RenderCtx = {
		workspaceId,
		onSplit: handleSplit,
		onClose: handleClose,
		onFocus: handleFocus,
		rootIsLeaf: tree.kind === "leaf",
	};

	return <div className="h-full w-full">{renderPane(tree, ctx, ALL_CORNERS)}</div>;
}

export default PaneTree;
