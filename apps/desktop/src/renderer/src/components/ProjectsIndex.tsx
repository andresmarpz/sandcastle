import { useAtomValue } from "@effect/atom-react";
import { FolderIcon } from "@phosphor-icons/react";
import { Cause } from "effect";

import { Client } from "@/rpc/client";

function ProjectsIndex(): React.JSX.Element {
	const projectsResult = useAtomValue(
		Client.query("projects.list", {}, { reactivityKeys: ["projects"] }),
	);

	if (projectsResult._tag === "Initial") {
		return <p className="p-4 text-xs text-muted-foreground">Loading projects…</p>;
	}
	if (projectsResult._tag === "Failure") {
		return <p className="p-4 text-xs text-destructive">{Cause.pretty(projectsResult.cause)}</p>;
	}

	const projects = projectsResult.value;

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-6">
			<header className="space-y-1">
				<h1 className="text-lg font-semibold">Projects</h1>
				<p className="text-xs text-muted-foreground">
					Open a project from the sidebar, or add a new one.
				</p>
			</header>
			{projects.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
					No projects yet. Use the “New Project” button in the sidebar.
				</div>
			) : (
				<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{projects.map((project) => (
						<li
							key={project.id}
							className="flex items-start gap-2 rounded-lg border border-border bg-card p-3"
						>
							<FolderIcon className="mt-0.5 size-4 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{project.name}</p>
								<p className="truncate text-xs text-muted-foreground">{project.rootPath}</p>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default ProjectsIndex;
