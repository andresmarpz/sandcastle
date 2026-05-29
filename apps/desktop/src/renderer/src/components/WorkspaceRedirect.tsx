import { useAtomValue } from "@effect/atom-react";
import type { WorkspaceId } from "@sandcastle/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Cause } from "effect";
import { useEffect } from "react";

import { Client } from "@/rpc/client";
import { useTabsStore } from "@/stores/tabs";

type Props = {
	workspaceId: WorkspaceId;
};

function WorkspaceRedirect({ workspaceId }: Props): React.JSX.Element {
	const navigate = useNavigate();
	const ensureTab = useTabsStore((s) => s.ensureTab);

	const workspaceResult = useAtomValue(
		Client.query(
			"workspaces.get",
			{ workspaceId },
			{ reactivityKeys: ["workspaces", workspaceId as string] },
		),
	);

	useEffect(() => {
		if (workspaceResult._tag !== "Success") return;
		// The tab's terminals resolve their cwd from the workspace path at render,
		// so ensureTab doesn't need it — it just guarantees a tab exists.
		const tabId = ensureTab(workspaceId);
		void navigate({
			to: "/workspaces/$wsId/tabs/$tabId",
			params: { wsId: workspaceId as string, tabId },
			replace: true,
		});
	}, [workspaceResult, workspaceId, ensureTab, navigate]);

	if (workspaceResult._tag === "Failure") {
		return <p className="p-4 text-xs text-destructive">{Cause.pretty(workspaceResult.cause)}</p>;
	}
	return <p className="p-4 text-xs text-muted-foreground">Opening workspace…</p>;
}

export default WorkspaceRedirect;
