import { useAtomValue } from "@effect/atom-react";
import { DotsThreeIcon, GearIcon, QuestionIcon } from "@phosphor-icons/react";
import type { Project, Workspace } from "@sandcastle/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Cause } from "effect";
import { useState } from "react";

import NewProjectDialog from "@/components/NewProjectDialog";
import NewWorkspaceDialog from "@/components/NewWorkspaceDialog";
import StackedIcons from "@/components/StackedIcons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup } from "@/components/ui/sidebar";
import { useTabProcesses } from "@/hooks/useTabProcesses";
import { cn } from "@/lib/utils";
import { Client } from "@/rpc/client";
import { type Tab, useTabsStore } from "@/stores/tabs";

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

function WorkspaceTabRow({
	wsId,
	tab,
	isActive,
}: {
	wsId: string;
	tab: Tab;
	isActive: boolean;
}): React.JSX.Element {
	const navigate = useNavigate();
	// Sidebar rows aren't the user's focus; poll slower than TabBar (which uses
	// 1s/2.5s) to keep idle cost low when many workspaces are expanded.
	const procs = useTabProcesses({ tree: tab.tree, intervalMs: 4000 });

	return (
		<li>
			<button
				type="button"
				onClick={() => {
					void navigate({
						to: "/workspaces/$wsId/tabs/$tabId",
						params: { wsId, tabId: tab.id },
					});
				}}
				title={tab.title}
				className={cn(
					"flex h-6 w-full items-center gap-1.5 rounded-md border border-transparent pr-2 pl-1.5 text-left text-xs",
					isActive
						? ACTIVE_ROW_CLASSES
						: "text-foreground-tertiary hover:bg-sidebar-accent/60 hover:text-foreground",
				)}
			>
				<StackedIcons
					items={procs.map((p) => ({ key: p.leafId, kind: p.kind, label: p.comm ?? "" }))}
					size={12}
					max={3}
					chipSurfaceClass="bg-sidebar border-sidebar"
				/>
				<span className="min-w-0 flex-1 truncate">{tab.title}</span>
			</button>
		</li>
	);
}

const EMPTY_TABS: readonly Tab[] = [];

function WorkspaceTabList({
	wsId,
	activeTabId,
}: {
	wsId: string;
	activeTabId: string | undefined;
}): React.JSX.Element | null {
	const tabs = useTabsStore((s) => s.byWorkspace[wsId]?.tabs ?? EMPTY_TABS);
	if (tabs.length === 0) return null;
	return (
		<ul className="mt-[6px] ml-[6px] flex flex-col gap-px border-l border-sidebar-border/70 pl-1.5">
			{tabs.map((tab) => (
				<WorkspaceTabRow
					key={tab.id}
					wsId={wsId}
					tab={tab}
					isActive={tab.id === activeTabId}
				/>
			))}
		</ul>
	);
}

function WorkspaceItem({
	ws,
	isActive,
	activeTabId,
	onSelect,
}: {
	ws: Workspace;
	isActive: boolean;
	activeTabId: string | undefined;
	onSelect: (wsId: string) => void;
}): React.JSX.Element {
	const wsIdStr = ws.id as string;
	const hasTabs = useTabsStore((s) => (s.byWorkspace[wsIdStr]?.tabs.length ?? 0) > 0);
	const [open, setOpen] = useState(false);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div
				className={cn(
					"flex h-7 w-full items-center gap-0.5 rounded-md border border-transparent text-xsm",
					isActive
						? ACTIVE_ROW_CLASSES
						: "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
				)}
			>
				<CollapsibleTrigger
					aria-label={open ? "Collapse tabs" : "Expand tabs"}
					disabled={!hasTabs}
					className={cn(
						"grid size-5 shrink-0 place-items-center rounded text-foreground-tertiary",
						hasTabs ? "hover:text-foreground" : "opacity-40",
					)}
				>
					<span
						role="img"
						className="relative flex size-2 shrink-0 items-center"
						title={ws.name}
						aria-label={ws.name}
					>
						<span className="h-px w-full bg-muted-foreground" />
					</span>
				</CollapsibleTrigger>
				<button
					type="button"
					onClick={() => onSelect(wsIdStr)}
					title={ws.name}
					className="flex h-full min-w-0 flex-1 items-center pr-2 text-left"
				>
					<span className="truncate">{ws.name}</span>
				</button>
			</div>
			<CollapsibleContent className="data-closed:hidden">
				<WorkspaceTabList wsId={wsIdStr} activeTabId={isActive ? activeTabId : undefined} />
			</CollapsibleContent>
		</Collapsible>
	);
}

function ProjectWorkspaces({
	workspaces,
	activeWsId,
	activeTabId,
}: {
	workspaces: readonly Workspace[];
	activeWsId: string | undefined;
	activeTabId: string | undefined;
}): React.JSX.Element {
	const navigate = useNavigate();

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
		<ul className="flex flex-col gap-1.5 py-0.5">
			{workspaces.map((ws) => {
				const wsIdStr = ws.id as string;
				const isActive = wsIdStr === activeWsId;
				return (
					<li key={wsIdStr}>
						<WorkspaceItem
							ws={ws}
							isActive={isActive}
							activeTabId={activeTabId}
							onSelect={handleSelect}
						/>
					</li>
				);
			})}
		</ul>
	);
}

function ProjectItem({ project }: { project: Project }): React.JSX.Element {
	const [open, setOpen] = useState(true);
	const [menuOpen, setMenuOpen] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const params = useParams({ strict: false }) as { wsId?: string; tabId?: string };
	const activeWsId = params.wsId;
	const activeTabId = params.tabId;

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
			<div
				className={cn(
					"group/project flex h-7 w-full items-center gap-2 rounded pr-1 pl-1 text-left text-xsm",
					"font-normal text-sidebar-foreground/85 hover:text-sidebar-foreground",
				)}
			>
				<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2">
					<ProjectAvatar name={project.name} />
					<span className="truncate">{project.name}</span>
				</CollapsibleTrigger>
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger
						aria-label={`${project.name} actions`}
						className={cn(
							"grid size-5 shrink-0 place-items-center rounded text-foreground-tertiary",
							"opacity-0 group-hover/project:opacity-100 hover:bg-sidebar-accent/60 hover:text-foreground data-popup-open:opacity-100",
							menuOpen && "opacity-100",
						)}
					>
						<DotsThreeIcon className="size-4" weight="bold" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={4}>
						<DropdownMenuItem
							onClick={() => {
								setMenuOpen(false);
								setDialogOpen(true);
							}}
						>
							Add workspace
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<CollapsibleContent className="data-closed:hidden">
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
					<ProjectWorkspaces
						workspaces={workspaces}
						activeWsId={activeWsId}
						activeTabId={activeTabId}
					/>
				)}
			</CollapsibleContent>
			<NewWorkspaceDialog
				projectId={project.id}
				projectName={project.name}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
			/>
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
