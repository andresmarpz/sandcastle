import { useAtomValue } from "@effect/atom-react";
import type { Project, ProjectId } from "@sandcastle/contracts";
import { useNavigate } from "@tanstack/react-router";

import { Client } from "@/rpc/client";

import type { KeybindingId } from "./registry";
import { useKeybinding } from "./useKeybinding";

const PROJECT_SWITCH_IDS = [
	"project.switch.1",
	"project.switch.2",
	"project.switch.3",
	"project.switch.4",
	"project.switch.5",
	"project.switch.6",
	"project.switch.7",
	"project.switch.8",
	"project.switch.9",
] as const satisfies readonly KeybindingId[];

type SlotProps = {
	id: KeybindingId;
	projectId: ProjectId;
};

function ProjectSwitchSlot({ id, projectId }: SlotProps): null {
	const navigate = useNavigate();
	const workspacesResult = useAtomValue(
		Client.query(
			"workspaces.list",
			{ projectId },
			{ reactivityKeys: ["workspaces", projectId as string] },
		),
	);

	useKeybinding(id, () => {
		if (workspacesResult._tag !== "Success") return;
		const ws = workspacesResult.value[0];
		if (!ws) return;
		void navigate({
			to: "/workspaces/$wsId",
			params: { wsId: ws.id as string },
		});
	});

	return null;
}

/**
 * Registers Control+1..9 to switch to the Nth project. Each binding navigates
 * to the project's workspace root and lets the router resolve the active tab.
 *
 * Slots mount only for projects that actually exist, so unused bindings simply
 * don't register — the registry still declares all 9.
 */
function ProjectKeybindings(): React.JSX.Element | null {
	const projectsResult = useAtomValue(
		Client.query("projects.list", {}, { reactivityKeys: ["projects"] }),
	);

	if (projectsResult._tag !== "Success") return null;

	const projects: readonly Project[] = projectsResult.value.slice(0, PROJECT_SWITCH_IDS.length);

	return (
		<>
			{projects.map((project, index) => (
				<ProjectSwitchSlot
					key={project.id as string}
					id={PROJECT_SWITCH_IDS[index]}
					projectId={project.id}
				/>
			))}
		</>
	);
}

export default ProjectKeybindings;
