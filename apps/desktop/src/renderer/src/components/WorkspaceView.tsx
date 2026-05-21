import { useAtomValue } from "@effect/atom-react";
import type { WorkspaceId } from "@sandcastle/contracts";
import { Cause } from "effect";

import PaneTree from "@/components/PaneTree";
import WorkspaceKeybindings from "@/keybindings/WorkspaceKeybindings";
import { Client } from "@/rpc/client";
import { type TabId, useTabsStore } from "@/stores/tabs";

type Props = {
	workspaceId: WorkspaceId;
	tabId: TabId;
};

function WorkspaceView({ workspaceId, tabId }: Props): React.JSX.Element {
	const workspaceResult = useAtomValue(
		Client.query(
			"workspaces.get",
			{ workspaceId },
			{ reactivityKeys: ["workspaces", workspaceId as string] },
		),
	);

	const tab = useTabsStore((s) =>
		s.byWorkspace[workspaceId as string]?.tabs.find((t) => t.id === tabId),
	);

	if (workspaceResult._tag === "Initial") {
		return <p className="p-4 text-xs text-muted-foreground">Loading workspace…</p>;
	}
	if (workspaceResult._tag === "Failure") {
		return (
			<p className="p-4 text-xs text-destructive">{Cause.pretty(workspaceResult.cause)}</p>
		);
	}
	if (!tab) {
		return <p className="p-4 text-xs text-muted-foreground">Tab not found</p>;
	}

	const defaultCwd = workspaceResult.value.path as unknown as string;

	return (
		<div className="min-h-0 flex-1">
			<WorkspaceKeybindings workspaceId={workspaceId} tabId={tabId} />
			<PaneTree workspaceId={workspaceId} tabId={tabId} defaultCwd={defaultCwd} />
		</div>
	);
}

export default WorkspaceView;
