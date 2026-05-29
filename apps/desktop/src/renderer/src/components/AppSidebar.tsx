import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import {
	DotsSixVerticalIcon,
	DotsThreeIcon,
	GearIcon,
	PaletteIcon,
	PlusIcon,
	QuestionIcon,
} from "@phosphor-icons/react";
import type { Project, ProjectId, Workspace } from "@sandcastle/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Cause } from "effect";
import { useCallback, useEffect, useMemo, useState } from "react";

import NewProjectDialog from "@/components/NewProjectDialog";
import NewWorkspaceDialog from "@/components/NewWorkspaceDialog";
import PersonalizeProjectDialog from "@/components/PersonalizeProjectDialog";
import StackedIcons from "@/components/StackedIcons";
import StatusDot from "@/components/StatusDot";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup } from "@/components/ui/sidebar";
import { useTabProcesses } from "@/hooks/useTabProcesses";
import {
	type AvatarColorKey,
	assignColors,
	firstGrapheme,
	loadColorMap,
	saveColorMap,
} from "@/lib/avatarColors";
import { cn } from "@/lib/utils";
import { Client } from "@/rpc/client";
import { workspacesListQuery } from "@/rpc/queries";
import { useActivityStore, useWorkspaceActivity } from "@/stores/activity";
import { type Tab, useTabsStore } from "@/stores/tabs";

const STATUS_LABEL: Record<string, string> = {
	working: "working",
	done: "done",
	"needs-attention": "needs attention",
};

const ACTIVE_ROW_CLASSES = "bg-sidebar text-foreground shadow-elevated";

function ProjectAvatar({
	name,
	color,
}: {
	name: string;
	color: AvatarColorKey | undefined;
}): React.JSX.Element {
	const letter = (firstGrapheme(name) || "?").toUpperCase();
	const style = color
		? ({
				background: `var(--avatar-background-${color})`,
				color: `var(--avatar-text-${color})`,
			} as React.CSSProperties)
		: undefined;
	return (
		<div
			aria-hidden
			style={style}
			className={cn(
				"relative grid size-5 shrink-0 place-items-center overflow-hidden rounded",
				"border-[0.5px] border-border text-[10px] font-medium uppercase",
				"before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0))]",
				!color && "bg-muted text-foreground-tertiary",
			)}
		>
			<span className="relative">{letter}</span>
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
				<WorkspaceTabRow key={tab.id} wsId={wsId} tab={tab} isActive={tab.id === activeTabId} />
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
	const status = useWorkspaceActivity(wsIdStr);
	const [open, setOpen] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const navigate = useNavigate();

	const deleteWorkspace = useAtomSet(Client.mutation("workspaces.delete"), { mode: "promise" });

	const handleDelete = (): void => {
		void deleteWorkspace({
			payload: { workspaceId: ws.id },
			// Same key the sidebar's workspaces.list query subscribes to, so the
			// row drops out as soon as the server confirms the delete.
			reactivityKeys: ["workspaces", ws.projectId as string],
		}).then(
			() => {
				// The deleted workspace is what we're viewing — fall back to the
				// projects index so the route doesn't dangle on a dead id.
				if (isActive) void navigate({ to: "/" });
			},
			() => {
				// No inline surface on the row; the list reactivity key keeps the
				// UI consistent with the server either way.
			},
		);
	};

	const label = STATUS_LABEL[status] ? `${ws.name} — ${STATUS_LABEL[status]}` : ws.name;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div
				className={cn(
					"group/workspace flex h-[26px] w-full items-center gap-0.5 rounded-md border border-transparent pr-0.5 text-xsm",
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
						className="relative flex size-2 shrink-0 items-center justify-center"
						title={label}
						aria-label={label}
					>
						<StatusDot status={status} />
					</span>
				</CollapsibleTrigger>
				<button
					type="button"
					onClick={() => onSelect(wsIdStr)}
					title={ws.name}
					className="flex h-full min-w-0 flex-1 items-center pr-1 text-left"
				>
					<span className="truncate">{ws.name}</span>
				</button>
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger
						aria-label={`${ws.name} actions`}
						className={cn(
							"grid size-5 shrink-0 place-items-center rounded text-foreground-tertiary",
							"opacity-0 group-hover/workspace:opacity-100 hover:bg-sidebar-accent/60 hover:text-foreground data-popup-open:opacity-100",
							menuOpen && "opacity-100",
						)}
					>
						<DotsThreeIcon className="size-4" weight="bold" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={4}>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => {
								setMenuOpen(false);
								handleDelete();
							}}
						>
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
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
		// Opening a workspace acknowledges its done/needs-attention latches.
		useActivityStore.getState().acknowledgeWorkspace(wsId);
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

function ProjectItem({
	project,
	color,
	onColorChange,
}: {
	project: Project;
	color: AvatarColorKey | undefined;
	onColorChange: (color: AvatarColorKey) => void;
}): React.JSX.Element {
	const [open, setOpen] = useState(true);
	const [menuOpen, setMenuOpen] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [personalizeOpen, setPersonalizeOpen] = useState(false);
	const params = useParams({ strict: false }) as { wsId?: string; tabId?: string };
	const activeWsId = params.wsId;
	const activeTabId = params.tabId;

	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: project.id as string });

	const workspacesResult = useAtomValue(workspacesListQuery(project.id));
	const workspaces =
		workspacesResult._tag === "Success" ? workspacesResult.value : ([] as readonly Workspace[]);

	// Vertical list: pin the drag transform to the Y axis so the floating block
	// can never drift sideways and trip the sidebar's horizontal scroll.
	const sortableStyle: React.CSSProperties = {
		transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
		transition,
	};

	return (
		// The sortable node wraps the whole project (header + its workspaces) so
		// dnd-kit measures the full height: the lifted block carries its
		// workspaces and the gap it leaves behind matches what's being dropped in.
		<div
			ref={setNodeRef}
			style={sortableStyle}
			className={cn(
				"border-sidebar-border/50 border-b py-2 first:pt-0 last:border-b-0 last:pb-0",
				// The lifted card is self-contained — drop its divider so no stray
				// rule rides along underneath it while floating.
				isDragging && "relative z-10 border-b-0",
			)}
		>
			<Collapsible
				open={open}
				onOpenChange={setOpen}
				className={cn("rounded", isDragging && "bg-sidebar opacity-95 shadow-elevated")}
			>
				<div
					className={cn(
						"group/project flex h-7 w-full items-center gap-1 rounded pr-0.5 pl-1 text-left text-xsm",
						"font-normal text-sidebar-foreground/85 hover:text-sidebar-foreground",
					)}
				>
					<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2">
						<ProjectAvatar name={project.name} color={color} />
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
								<PlusIcon />
								Add workspace
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => {
									setMenuOpen(false);
									setPersonalizeOpen(true);
								}}
							>
								<PaletteIcon />
								Personalize
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<button
						type="button"
						ref={setActivatorNodeRef}
						aria-label={`Reorder ${project.name}`}
						{...attributes}
						{...listeners}
						className={cn(
							"grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded text-foreground-tertiary",
							"opacity-0 group-hover/project:opacity-100 hover:bg-sidebar-accent/60 hover:text-foreground active:cursor-grabbing",
							isDragging && "cursor-grabbing opacity-100",
						)}
					>
						<DotsSixVerticalIcon className="size-4" weight="bold" />
					</button>
				</div>
				<CollapsibleContent className="data-closed:hidden ml-[11px] border-l border-sidebar-border/50 pl-2.5">
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
				<PersonalizeProjectDialog
					projectName={project.name}
					currentColor={color}
					open={personalizeOpen}
					onOpenChange={setPersonalizeOpen}
					onSave={onColorChange}
				/>
			</Collapsible>
		</div>
	);
}

function useProjectAvatarColors(projectIds: readonly string[]): {
	colors: Record<string, AvatarColorKey>;
	setColor: (projectId: string, color: AvatarColorKey) => void;
} {
	const [colors, setColors] = useState<Record<string, AvatarColorKey>>(() => loadColorMap());

	useEffect(() => {
		if (projectIds.length === 0) return;
		setColors((prev) => {
			const next = assignColors(projectIds, prev);
			if (next !== prev) saveColorMap(next);
			return next;
		});
	}, [projectIds]);

	// User-chosen colors are written straight into the same persisted map.
	// assignColors only fills gaps, so an explicit pick is never overwritten.
	const setColor = useCallback((projectId: string, color: AvatarColorKey) => {
		setColors((prev) => {
			if (prev[projectId] === color) return prev;
			const next = { ...prev, [projectId]: color };
			saveColorMap(next);
			return next;
		});
	}, []);

	return { colors, setColor };
}

function ProjectList(): React.JSX.Element {
	const projectsResult = useAtomValue(
		Client.query("projects.list", {}, { reactivityKeys: ["projects"] }),
	);

	const projects =
		projectsResult._tag === "Success" ? projectsResult.value : ([] as readonly Project[]);
	const serverIds = useMemo(() => projects.map((p) => p.id as string), [projects]);
	const { colors, setColor } = useProjectAvatarColors(serverIds);

	// Optimistic local ordering. Stays in sync with the server's set of IDs
	// (handles create/delete), but allows us to reflect a drag-drop immediately
	// while the projects.reorder mutation is in-flight.
	const [localOrder, setLocalOrder] = useState<readonly string[]>(serverIds);
	useEffect(() => {
		setLocalOrder((prev) => {
			if (prev.length === serverIds.length && prev.every((id, i) => id === serverIds[i])) {
				return prev;
			}
			const prevSet = new Set(prev);
			const serverSet = new Set(serverIds);
			const sameSet = prev.length === serverIds.length && serverIds.every((id) => prevSet.has(id));
			if (sameSet) {
				// Same membership, server-side order changed (e.g., after another
				// client reorder or initial load) — adopt server order.
				return serverIds;
			}
			// Membership changed: keep relative order for IDs we still have, then
			// append new ones at the bottom, drop removed ones.
			const kept = prev.filter((id) => serverSet.has(id));
			const added = serverIds.filter((id) => !prevSet.has(id));
			return [...kept, ...added];
		});
	}, [serverIds]);

	const orderedProjects = useMemo(() => {
		const byId = new Map(projects.map((p) => [p.id as string, p]));
		const out: Project[] = [];
		for (const id of localOrder) {
			const p = byId.get(id);
			if (p) out.push(p);
		}
		return out;
	}, [projects, localOrder]);

	const reorderProjects = useAtomSet(Client.mutation("projects.reorder"), { mode: "promise" });

	const sensors = useSensors(
		// Require a few pixels of movement before claiming the drag so clicks
		// (expand chevron, dropdown menu) still work normally on the row.
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	const handleDragEnd = (event: DragEndEvent): void => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = localOrder.indexOf(active.id as string);
		const newIndex = localOrder.indexOf(over.id as string);
		if (oldIndex < 0 || newIndex < 0) return;

		const prev = localOrder;
		const next = arrayMove([...localOrder], oldIndex, newIndex);
		setLocalOrder(next);

		void reorderProjects({
			payload: { projectIds: next as ReadonlyArray<string> as ReadonlyArray<ProjectId> },
			reactivityKeys: ["projects"],
		}).catch(() => {
			// Server rejected — revert to last known good order.
			setLocalOrder(prev);
		});
	};

	if (projectsResult._tag === "Initial") {
		return <p className="px-2 py-1 text-xs text-foreground-tertiary">Loading…</p>;
	}
	if (projectsResult._tag === "Failure") {
		return (
			<p className="px-2 py-1 text-xs text-destructive">{Cause.pretty(projectsResult.cause)}</p>
		);
	}
	if (orderedProjects.length === 0) {
		return <p className="px-2 py-1 text-xs text-foreground-tertiary">No projects yet</p>;
	}
	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<SortableContext items={localOrder as string[]} strategy={verticalListSortingStrategy}>
				<div className="flex flex-col">
					{orderedProjects.map((project) => {
						const projectId = project.id as string;
						return (
							<ProjectItem
								key={project.id}
								project={project}
								color={colors[projectId]}
								onColorChange={(next) => setColor(projectId, next)}
							/>
						);
					})}
				</div>
			</SortableContext>
		</DndContext>
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
		<Sidebar collapsible="offcanvas" variant="sidebar">
			<SidebarContent>
				<SidebarGroup>
					<ProjectList />
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
				<div className="ml-auto">
					<NewProjectDialog />
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}

export default AppSidebar;
