import { useAtomValue } from "@effect/atom-react";
import {
	CaretRightIcon,
	CheckIcon,
	FolderIcon,
	PlusCircleIcon,
	StackIcon,
	XIcon,
} from "@phosphor-icons/react";
import type { ProjectId, WorkspaceId } from "@sandcastle/contracts";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { projectsListQuery, workspacesListQuery } from "@/rpc/queries";

/**
 * Context attached to an automation. `projectId === null` means no context.
 * `workspaceId === null` (with a project set) means "use the Local workspace",
 * which is the default when only a project is referenced.
 */
export type AutomationContext = {
	projectId: ProjectId | null;
	workspaceId: WorkspaceId | null;
};

export const EMPTY_CONTEXT: AutomationContext = { projectId: null, workspaceId: null };

/** Resolves a workspace id to its display name within a project. */
function WorkspaceName({
	projectId,
	workspaceId,
}: {
	projectId: ProjectId;
	workspaceId: WorkspaceId;
}): React.JSX.Element {
	const result = useAtomValue(workspacesListQuery(projectId));
	const workspaces = result._tag === "Success" ? result.value : [];
	const ws = workspaces.find((w) => w.id === workspaceId);
	return <>{ws?.name ?? "Workspace"}</>;
}

function ProjectPanel({
	selectedId,
	onSelect,
}: {
	selectedId: ProjectId | null;
	onSelect: (id: ProjectId) => void;
}): React.JSX.Element {
	const result = useAtomValue(projectsListQuery());

	if (result._tag === "Initial") {
		return <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading projects…</p>;
	}
	if (result._tag === "Failure") {
		return <p className="px-2 py-1.5 text-xs text-destructive">Couldn’t load projects.</p>;
	}
	if (result.value.length === 0) {
		return <p className="px-2 py-1.5 text-xs text-muted-foreground">No projects yet.</p>;
	}

	return (
		<div className="max-h-44 overflow-y-auto">
			{result.value.map((project) => (
				<button
					key={project.id}
					type="button"
					onClick={() => onSelect(project.id)}
					className={cn(
						"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xsm hover:bg-muted",
						selectedId === project.id && "bg-muted",
					)}
				>
					<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1 truncate">{project.name}</span>
					{selectedId === project.id ? (
						<CheckIcon className="size-3.5 shrink-0 text-primary" weight="bold" />
					) : null}
				</button>
			))}
		</div>
	);
}

function WorkspacePanel({
	projectId,
	selectedId,
	onSelect,
}: {
	projectId: ProjectId;
	selectedId: WorkspaceId | null;
	onSelect: (id: WorkspaceId | null) => void;
}): React.JSX.Element {
	const result = useAtomValue(workspacesListQuery(projectId));
	// The Local workspace is represented by the "default" option, so drop it here.
	const worktrees = result._tag === "Success" ? result.value.filter((w) => w.kind !== "local") : [];

	return (
		<div>
			<button
				type="button"
				onClick={() => onSelect(null)}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xsm hover:bg-muted",
					selectedId === null && "bg-muted",
				)}
			>
				<StackIcon className="size-4 shrink-0 text-muted-foreground" />
				<span className="flex-1">
					Local <span className="text-muted-foreground">· default</span>
				</span>
				{selectedId === null ? (
					<CheckIcon className="size-3.5 shrink-0 text-primary" weight="bold" />
				) : null}
			</button>
			{result._tag === "Initial" ? (
				<p className="px-2 py-1.5 text-xs text-muted-foreground">Loading workspaces…</p>
			) : null}
			<div className="max-h-36 overflow-y-auto">
				{worktrees.map((ws) => (
					<button
						key={ws.id}
						type="button"
						onClick={() => onSelect(ws.id)}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xsm hover:bg-muted",
							selectedId === ws.id && "bg-muted",
						)}
					>
						<StackIcon className="size-4 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate">{ws.name}</span>
						{selectedId === ws.id ? (
							<CheckIcon className="size-3.5 shrink-0 text-primary" weight="bold" />
						) : null}
					</button>
				))}
			</div>
		</div>
	);
}

type Props = {
	value: AutomationContext;
	onChange: (next: AutomationContext) => void;
};

function AutomationContextField({ value, onChange }: Props): React.JSX.Element {
	const [panel, setPanel] = useState<"none" | "project" | "workspace">("none");
	const projectsResult = useAtomValue(projectsListQuery());
	const projects = projectsResult._tag === "Success" ? projectsResult.value : [];
	const selectedProject = projects.find((p) => p.id === value.projectId) ?? null;

	if (value.projectId === null) {
		return (
			<div className="flex flex-col gap-2">
				<button
					type="button"
					onClick={() => setPanel(panel === "project" ? "none" : "project")}
					className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xsm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<PlusCircleIcon className="size-4" />
					Attach a project or workspace as context
				</button>
				{panel === "project" ? (
					<div className="rounded-lg border border-border bg-popover p-1 shadow-sm">
						<ProjectPanel
							selectedId={value.projectId}
							onSelect={(id) => {
								onChange({ projectId: id, workspaceId: null });
								setPanel("none");
							}}
						/>
					</div>
				) : null}
			</div>
		);
	}

	const projectId = value.projectId;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1.5">
				<button
					type="button"
					onClick={() => setPanel(panel === "project" ? "none" : "project")}
					className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xsm hover:bg-muted"
				>
					<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0 truncate font-medium">{selectedProject?.name ?? "Project"}</span>
				</button>
				<CaretRightIcon className="size-3 shrink-0 text-muted-foreground" />
				<button
					type="button"
					onClick={() => setPanel(panel === "workspace" ? "none" : "workspace")}
					className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xsm hover:bg-muted"
				>
					<StackIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0 truncate">
						{value.workspaceId === null ? (
							<>
								Local <span className="text-muted-foreground">· default</span>
							</>
						) : (
							<WorkspaceName projectId={projectId} workspaceId={value.workspaceId} />
						)}
					</span>
				</button>
				<button
					type="button"
					aria-label="Remove context"
					title="Remove context"
					onClick={() => {
						onChange(EMPTY_CONTEXT);
						setPanel("none");
					}}
					className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<XIcon className="size-3.5" />
				</button>
			</div>

			{panel === "project" ? (
				<div className="rounded-lg border border-border bg-popover p-1 shadow-sm">
					<ProjectPanel
						selectedId={value.projectId}
						onSelect={(id) => {
							// Switching project resets the workspace back to Local.
							onChange({ projectId: id, workspaceId: null });
							setPanel("none");
						}}
					/>
				</div>
			) : null}

			{panel === "workspace" ? (
				<div className="rounded-lg border border-border bg-popover p-1 shadow-sm">
					<WorkspacePanel
						projectId={projectId}
						selectedId={value.workspaceId}
						onSelect={(id) => {
							onChange({ projectId, workspaceId: id });
							setPanel("none");
						}}
					/>
				</div>
			) : null}
		</div>
	);
}

/** Compact, read-only summary of an automation's context (used on cards). */
export function ContextSummary({ context }: { context: AutomationContext }): React.JSX.Element {
	const projectsResult = useAtomValue(projectsListQuery());
	const projects = projectsResult._tag === "Success" ? projectsResult.value : [];

	if (context.projectId === null) {
		return <span className="text-muted-foreground">No context</span>;
	}

	const project = projects.find((p) => p.id === context.projectId);
	return (
		<span className="inline-flex items-center gap-1">
			<FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="truncate">{project?.name ?? "Project"}</span>
			<CaretRightIcon className="size-3 shrink-0 text-muted-foreground" />
			<StackIcon className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="truncate">
				{context.workspaceId === null ? (
					"Local"
				) : (
					<WorkspaceName projectId={context.projectId} workspaceId={context.workspaceId} />
				)}
			</span>
		</span>
	);
}

export default AutomationContextField;
