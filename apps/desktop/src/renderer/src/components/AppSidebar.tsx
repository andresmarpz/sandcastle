import { useAtomValue } from "@effect/atom-react";
import { GearIcon, QuestionIcon } from "@phosphor-icons/react";
import type { Project, Workspace } from "@sandcastle/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Cause } from "effect";
import { useState } from "react";

import NewProjectDialog from "@/components/NewProjectDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Client } from "@/rpc/client";
import { useTabsStore } from "@/stores/tabs";

const ACTIVE_ROW_CLASSES =
	"border border-border bg-sidebar text-foreground shadow-[0_1px_1px_rgba(0,0,0,0.03),0_2px_6px_-2px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_1px_rgba(0,0,0,0.25),0_4px_10px_-3px_rgba(0,0,0,0.35)]";

function ProjectAvatar({ name }: { name: string }): React.JSX.Element {
	const letter = (name.trim().charAt(0) || "?").toUpperCase();
	return (
		<div
			aria-hidden
			className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-medium uppercase text-foreground-tertiary"
		>
			{letter}
		</div>
	);
}

function ProjectWorkspaces({
	workspaces,
	activeWsId,
}: {
	workspaces: readonly Workspace[];
	activeWsId: string | undefined;
}): React.JSX.Element {
	const navigate = useNavigate();
	const byWorkspace = useTabsStore((s) => s.byWorkspace);

	if (workspaces.length === 0) {
		return (
			<div className="py-1 pl-2">
				<span className="text-xs text-foreground-tertiary">No workspaces yet</span>
			</div>
		);
	}

	const handleSelect = (wsId: string): void => {
		void navigate({ to: "/workspaces/$wsId", params: { wsId } });
	};

	return (
		<ul className="flex flex-col gap-px py-0.5">
			{workspaces.map((ws) => {
				const wsIdStr = ws.id as string;
				const isActive = wsIdStr === activeWsId;
				const tabCount = byWorkspace[wsIdStr]?.tabs.length ?? 0;
				return (
					<li key={wsIdStr}>
						<button
							type="button"
							onClick={() => handleSelect(wsIdStr)}
							title={ws.name}
							className={cn(
								"flex h-7 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-xsm",
								isActive
									? ACTIVE_ROW_CLASSES
									: "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
							)}
						>
							<span className="min-w-0 flex-1 truncate">{ws.name}</span>
							{tabCount > 0 ? (
								<span className="shrink-0 text-xs tabular-nums text-foreground-tertiary">
									{tabCount}
								</span>
							) : null}
						</button>
					</li>
				);
			})}
		</ul>
	);
}

function ProjectItem({ project }: { project: Project }): React.JSX.Element {
	const [open, setOpen] = useState(true);
	const params = useParams({ strict: false }) as { wsId?: string };
	const activeWsId = params.wsId;

	const workspacesResult = useAtomValue(
		Client.query(
			"workspaces.list",
			{ projectId: project.id },
			{ reactivityKeys: ["workspaces", project.id as string] },
		),
	);
	const workspaces =
		workspacesResult._tag === "Success" ? workspacesResult.value : ([] as readonly Workspace[]);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded px-1 text-left text-xsm",
					"font-normal text-sidebar-foreground/85 hover:text-sidebar-foreground",
				)}
			>
				<ProjectAvatar name={project.name} />
				<span className="truncate">{project.name}</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="data-closed:hidden">
				<div className="ml-[15px] border-l border-sidebar-border/70 pl-1">
					{workspacesResult._tag === "Initial" ? (
						<div className="py-1 pl-2">
							<span className="text-xs text-foreground-tertiary">Loading…</span>
						</div>
					) : workspacesResult._tag === "Failure" ? (
						<div className="py-1 pl-2">
							<span className="text-xs text-destructive">
								{Cause.pretty(workspacesResult.cause)}
							</span>
						</div>
					) : (
						<ProjectWorkspaces workspaces={workspaces} activeWsId={activeWsId} />
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function ProjectList(): React.JSX.Element {
	const projectsResult = useAtomValue(
		Client.query("projects.list", {}, { reactivityKeys: ["projects"] }),
	);

	if (projectsResult._tag === "Initial") {
		return <p className="px-2 py-1 text-xs text-foreground-tertiary">Loading…</p>;
	}
	if (projectsResult._tag === "Failure") {
		return (
			<p className="px-2 py-1 text-xs text-destructive">{Cause.pretty(projectsResult.cause)}</p>
		);
	}
	const projects = projectsResult.value;
	if (projects.length === 0) {
		return <p className="px-2 py-1 text-xs text-foreground-tertiary">No projects yet</p>;
	}
	return (
		<div className="flex flex-col gap-3">
			{projects.map((project) => (
				<ProjectItem key={project.id} project={project} />
			))}
		</div>
	);
}

const FOOTER_ICON_CLASSES =
	"grid size-7 place-items-center rounded text-foreground-tertiary hover:bg-sidebar-accent/60 hover:text-foreground";

function FooterIconButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick?: () => void;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={FOOTER_ICON_CLASSES}
		>
			{children}
		</button>
	);
}

function AppSidebar(): React.JSX.Element {
	const navigate = useNavigate();

	return (
		<Sidebar collapsible="offcanvas" variant="inset">
			<SidebarContent>
				<SidebarGroup>
					<ProjectList />
				</SidebarGroup>
				<SidebarGroup className="pt-0">
					<NewProjectDialog />
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="flex-row items-center gap-1 px-2">
				<FooterIconButton label="Settings" onClick={() => void navigate({ to: "/settings" })}>
					<GearIcon className="size-4" />
				</FooterIconButton>
				<a
					href="https://github.com/andresmarpz/sandcastle"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Help"
					title="Help"
					className={FOOTER_ICON_CLASSES}
				>
					<QuestionIcon className="size-4" />
				</a>
			</SidebarFooter>
		</Sidebar>
	);
}

export default AppSidebar;
