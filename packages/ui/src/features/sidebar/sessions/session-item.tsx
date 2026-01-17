"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import type { Session } from "@sandcastle/schemas";
import { IconArchive, IconPencil, IconTrash } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
	deleteSessionMutation,
	SESSION_LIST_KEY,
} from "@/api/session-atoms";
import { worktreeAtomFamily } from "@/api/worktree-atoms";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/alert-dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/context-menu";
import { cn } from "@/lib/utils";

interface SessionItemProps {
	session: Session;
	repositoryId: string;
}

function formatRelativeTime(iso: string) {
	const timestamp = Date.parse(iso);
	if (Number.isNaN(timestamp)) {
		return "unknown";
	}
	return formatDistanceToNow(timestamp, {
		addSuffix: true,
	});
}

export function SessionItem({ session, repositoryId }: SessionItemProps) {
	const location = useLocation();
	const navigate = useNavigate();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const [deleteResult, deleteSession] = useAtom(deleteSessionMutation);
	const isDeleting = deleteResult.waiting;

	const sessionPath = `/repository/${repositoryId}/sessions/${session.id}`;
	const isActive = location.pathname === sessionPath;

	const lastActivityLabel = useMemo(
		() => formatRelativeTime(session.lastActivityAt),
		[session.lastActivityAt],
	);

	function handleSelect() {
		navigate(sessionPath);
	}

	function handleRename() {
		// TODO: implement rename
	}

	function handleArchive() {
		// TODO: implement archive
	}

	function handleDelete() {
		deleteSession({
			payload: { id: session.id },
			reactivityKeys: [
				SESSION_LIST_KEY,
				`sessions:repository:${session.repositoryId}`,
				session.worktreeId
					? `sessions:worktree:${session.worktreeId}`
					: undefined,
			].filter(Boolean) as string[],
		});
		setIsDeleteDialogOpen(false);
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger
					render={
						<button
							type="button"
							onClick={handleSelect}
							className={cn(
								"w-full rounded-md px-2 py-2 text-left transition-colors",
								"hover:bg-accent",
								isActive && "bg-accent",
							)}
						>
							<div className="flex items-start gap-2">
								<SessionStatusIndicator status={session.status} />
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="truncate text-sm font-medium">
											{session.title}
										</span>
										<SessionOriginBadge
											worktreeId={session.worktreeId}
										/>
									</div>
									<div className="text-muted-foreground text-xs mt-0.5">
										{lastActivityLabel}
									</div>
								</div>
							</div>
						</button>
					}
				/>

				<ContextMenuContent className="min-w-[160px]">
					<ContextMenuItem onClick={handleRename}>
						<IconPencil className="size-4" />
						Rename
					</ContextMenuItem>
					<ContextMenuItem onClick={handleArchive}>
						<IconArchive className="size-4" />
						Archive
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						variant="destructive"
						onClick={() => setIsDeleteDialogOpen(true)}
					>
						<IconTrash className="size-4" />
						Delete
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete session?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete "{session.title}" and all its
							conversation history. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting}
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

interface SessionStatusIndicatorProps {
	status: Session["status"];
}

function SessionStatusIndicator({ status }: SessionStatusIndicatorProps) {
	const statusConfig = {
		created: { color: "bg-muted-foreground", label: "Created" },
		active: { color: "bg-green-500", label: "Active" },
		paused: { color: "bg-yellow-500", label: "Paused" },
		completed: { color: "bg-muted-foreground", label: "Completed" },
		failed: { color: "bg-red-500", label: "Failed" },
	};

	const config = statusConfig[status] ?? statusConfig.created;

	return (
		<div
			className={cn(
				"size-2 rounded-full mt-1.5 shrink-0",
				config.color,
				status === "active" && "animate-pulse",
			)}
			title={config.label}
			aria-label={config.label}
		/>
	);
}

interface SessionOriginBadgeProps {
	worktreeId: string | null;
}

function SessionOriginBadge({ worktreeId }: SessionOriginBadgeProps) {
	if (!worktreeId) {
		return (
			<span className="text-muted-foreground text-xs shrink-0">[main]</span>
		);
	}

	return <WorktreeBadge worktreeId={worktreeId} />;
}

function WorktreeBadge({ worktreeId }: { worktreeId: string }) {
	const worktreeResult = useAtomValue(worktreeAtomFamily(worktreeId));

	const branchName = useMemo(() => {
		const worktree = Option.getOrUndefined(Result.value(worktreeResult));
		return worktree?.branch ?? "worktree";
	}, [worktreeResult]);

	return (
		<span
			className="text-muted-foreground text-xs shrink-0 max-w-[100px] truncate"
			title={branchName}
		>
			[{branchName}]
		</span>
	);
}
