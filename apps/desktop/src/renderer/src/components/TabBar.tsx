import { PlusIcon, XIcon } from "@phosphor-icons/react";
import type { WorkspaceId } from "@sandcastle/contracts";
import { useNavigate } from "@tanstack/react-router";

import StackedIcons from "@/components/StackedIcons";
import { Button } from "@/components/ui/button";
import { useTabProcesses } from "@/hooks/useTabProcesses";
import { useKeybinding } from "@/keybindings/useKeybinding";
import { collectLeafIds, type Pane } from "@/lib/paneTree";
import { disposeTerminal } from "@/lib/terminalRegistry";
import { cn } from "@/lib/utils";
import { type TabId, useTabsStore } from "@/stores/tabs";

type Props = {
	workspaceId: WorkspaceId;
	activeTabId: TabId;
	defaultCwd: string;
};

type TabItemProps = {
	id: TabId;
	title: string;
	tree: Pane;
	isActive: boolean;
	onSelect: () => void;
	onClose: () => void;
};

function TabItem({ title, tree, isActive, onSelect, onClose }: TabItemProps): React.JSX.Element {
	// Active tab polls a bit faster — the user is most likely looking at it.
	const procs = useTabProcesses({ tree, intervalMs: isActive ? 1000 : 2500 });

	return (
		// biome-ignore lint/a11y/useSemanticElements: tab wraps a nested close <button>, so a native <button> element cannot be used here
		<div
			role="button"
			tabIndex={0}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			className={cn(
				"no-drag group flex h-[26px] max-w-[200px] min-w-0 shrink-0 cursor-default items-center gap-1.5 rounded-md border px-2 text-xs",
				isActive
					? "border-border bg-card text-foreground"
					: "border-transparent text-muted-foreground hover:bg-card/60",
			)}
		>
			<StackedIcons
				items={procs.map((p) => ({ key: p.leafId, kind: p.kind, label: p.comm ?? "" }))}
				chipSurfaceClass={isActive ? "bg-card border-card" : "bg-background border-background"}
			/>
			<span className="min-w-0 flex-1 truncate text-left" title={title}>
				{title}
			</span>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				aria-label="Close tab"
				className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
			>
				<XIcon size={10} />
			</button>
		</div>
	);
}

function TabBar({ workspaceId, activeTabId, defaultCwd }: Props): React.JSX.Element {
	const navigate = useNavigate();
	const tabs = useTabsStore((s) => s.byWorkspace[workspaceId as string]?.tabs ?? []);
	const createTab = useTabsStore((s) => s.createTab);
	const closeTab = useTabsStore((s) => s.closeTab);
	const getWorkspace = useTabsStore((s) => s.getWorkspace);

	const handleSelect = (tabId: TabId): void => {
		void navigate({
			to: "/workspaces/$wsId/tabs/$tabId",
			params: { wsId: workspaceId as string, tabId },
		});
	};

	const handleNew = (): void => {
		const id = createTab(workspaceId, defaultCwd);
		void navigate({
			to: "/workspaces/$wsId/tabs/$tabId",
			params: { wsId: workspaceId as string, tabId: id },
		});
	};

	useKeybinding("tab.new", () => handleNew());

	const handleClose = (tabId: TabId): void => {
		const ws = getWorkspace(workspaceId);
		const closing = ws.tabs.find((t) => t.id === tabId);
		if (closing) {
			for (const leafId of collectLeafIds(closing.tree)) {
				disposeTerminal(leafId);
			}
		}
		const nextActive = closeTab(workspaceId, tabId);
		if (tabId !== activeTabId) return;
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
	};

	return (
		<div className="flex min-w-0 flex-1 items-center gap-1">
			<div className="flex min-w-0 shrink items-center gap-1 overflow-x-auto">
				{tabs.map((tab) => (
					<TabItem
						key={tab.id}
						id={tab.id}
						title={tab.title}
						tree={tab.tree}
						isActive={tab.id === activeTabId}
						onSelect={() => handleSelect(tab.id)}
						onClose={() => handleClose(tab.id)}
					/>
				))}
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="New tab"
				onClick={handleNew}
				className="no-drag"
			>
				<PlusIcon />
			</Button>
		</div>
	);
}

export default TabBar;
