import { useAtomValue } from "@effect/atom-react";
import { CaretRightIcon, FolderIcon, GearIcon } from "@phosphor-icons/react";
import type { Project, ProjectId } from "@sandcastle/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Cause } from "effect";
import { useState } from "react";

import NewProjectDialog from "@/components/NewProjectDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Client } from "@/rpc/client";

function WorkspaceList({ projectId }: { projectId: ProjectId }): React.JSX.Element {
	const navigate = useNavigate();
	const workspacesResult = useAtomValue(
		Client.query(
			"workspaces.list",
			{ projectId },
			{ reactivityKeys: ["workspaces", projectId as string] },
		),
	);

	if (workspacesResult._tag === "Initial") {
		return (
			<SidebarMenuSub>
				<SidebarMenuSubItem>
					<span className="px-2 py-1 text-xs text-muted-foreground">Loading…</span>
				</SidebarMenuSubItem>
			</SidebarMenuSub>
		);
	}
	if (workspacesResult._tag === "Failure") {
		return (
			<SidebarMenuSub>
				<SidebarMenuSubItem>
					<span className="px-2 py-1 text-xs text-destructive">
						{Cause.pretty(workspacesResult.cause)}
					</span>
				</SidebarMenuSubItem>
			</SidebarMenuSub>
		);
	}

	const workspaces = workspacesResult.value;
	if (workspaces.length === 0) {
		return (
			<SidebarMenuSub>
				<SidebarMenuSubItem>
					<span className="px-2 py-1 text-xs text-muted-foreground">No workspaces</span>
				</SidebarMenuSubItem>
			</SidebarMenuSub>
		);
	}

	return (
		<SidebarMenuSub>
			{workspaces.map((ws) => (
				<SidebarMenuSubItem key={ws.id}>
					<SidebarMenuSubButton
						onClick={() =>
							void navigate({
								to: "/workspaces/$wsId",
								params: { wsId: ws.id as string },
							})
						}
					>
						<span>{ws.name}</span>
					</SidebarMenuSubButton>
				</SidebarMenuSubItem>
			))}
		</SidebarMenuSub>
	);
}

function ProjectItem({ project }: { project: Project }): React.JSX.Element {
	const [open, setOpen] = useState(true);
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarMenuItem>
				<CollapsibleTrigger
					render={
						<SidebarMenuButton
							tooltip={project.rootPath}
							className="flex w-full items-center gap-2"
						/>
					}
				>
					<CaretRightIcon
						className={cn(
							"size-3 shrink-0 transition-transform duration-150",
							open && "rotate-90",
						)}
					/>
					<FolderIcon />
					<span className="truncate">{project.name}</span>
				</CollapsibleTrigger>
				<CollapsibleContent className="data-closed:hidden">
					<WorkspaceList projectId={project.id} />
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

function ProjectList(): React.JSX.Element {
	const projectsResult = useAtomValue(
		Client.query("projects.list", {}, { reactivityKeys: ["projects"] }),
	);

	if (projectsResult._tag === "Initial") {
		return <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>;
	}
	if (projectsResult._tag === "Failure") {
		return (
			<p className="px-2 py-1 text-xs text-destructive">{Cause.pretty(projectsResult.cause)}</p>
		);
	}
	const projects = projectsResult.value;
	if (projects.length === 0) {
		return <p className="px-2 py-1 text-xs text-muted-foreground">No projects yet</p>;
	}
	return (
		<SidebarMenu>
			{projects.map((project) => (
				<ProjectItem key={project.id} project={project} />
			))}
		</SidebarMenu>
	);
}

function AppSidebar(): React.JSX.Element {
	const navigate = useNavigate();

	return (
		<Sidebar collapsible="offcanvas" variant="inset">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<ProjectList />
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<NewProjectDialog />
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip="Settings"
							onClick={() => void navigate({ to: "/settings" })}
						>
							<GearIcon />
							<span>Settings</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}

export default AppSidebar;
