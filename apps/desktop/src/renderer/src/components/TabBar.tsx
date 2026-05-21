import type { WorkspaceId } from "@sandcastle/contracts";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { collectLeafIds } from "@/lib/paneTree";
import { disposeTerminal } from "@/lib/terminalRegistry";
import { cn } from "@/lib/utils";
import { type TabId, useTabsStore } from "@/stores/tabs";

type Props = {
	workspaceId: WorkspaceId;
	activeTabId: TabId;
	defaultCwd: string;
};

function TabBar({ workspaceId, activeTabId, defaultCwd }: Props): React.JSX.Element {
	const navigate = useNavigate();
	const tabs = useTabsStore(
		(s) => s.byWorkspace[workspaceId as string]?.tabs ?? [],
	);
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
				{tabs.map((tab) => {
					const isActive = tab.id === activeTabId;
					return (
						<div
							key={tab.id}
							className={cn(
								"no-drag group flex h-6 max-w-[180px] min-w-0 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
								isActive
									? "border-border bg-card text-foreground"
									: "border-transparent text-muted-foreground hover:bg-card/60",
							)}
						>
							<button
								type="button"
								onClick={() => handleSelect(tab.id)}
								className="min-w-0 flex-1 truncate text-left"
								title={tab.title}
							>
								{tab.title}
							</button>
							<button
								type="button"
								onClick={() => handleClose(tab.id)}
								aria-label="Close tab"
								className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
							>
								<XIcon size={10} />
							</button>
						</div>
					);
				})}
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
