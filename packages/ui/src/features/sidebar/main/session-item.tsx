"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import { ArchiveIcon } from "@phosphor-icons/react/Archive";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { PencilIcon } from "@phosphor-icons/react/Pencil";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import type { Session } from "@sandcastle/schemas";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import { motion } from "motion/react";
import { memo, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { deleteSessionMutation, SESSION_LIST_KEY } from "@/api/session-atoms";
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
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { Spinner } from "@/components/spinner";
import {
	SessionStatusDot,
	useSessionStatusIndicator,
} from "@/features/sidebar/main/session-status-indicator";
import { useSessionNavigation } from "@/hooks/use-session-navigation";

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

export const SessionItem = memo(function SessionItem({
	session,
	repositoryId,
}: SessionItemProps) {
	const location = useLocation();
	const { navigateToSession } = useSessionNavigation();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const [, deleteSession] = useAtom(deleteSessionMutation);

	const sessionPath = `/repository/${repositoryId}/sessions/${session.id}`;
	const isActive = location.pathname === sessionPath;

	const sessionStatusIndicator = useSessionStatusIndicator({
		sessionId: session.id,
		status: session.status,
	});

	const lastActivityLabel = useMemo(
		() => formatRelativeTime(session.lastActivityAt),
		[session.lastActivityAt],
	);

	function handleSelect() {
		navigateToSession(repositoryId, session.id);
	}

	function handleRename() {
		// TODO: implement rename
	}

	function handleArchive() {
		// TODO: implement archive
	}

	async function handleCopyWorkingPath() {
		await navigator.clipboard.writeText(session.workingPath);
	}

	function handleDelete() {
		setIsDeleteDialogOpen(false);
		setIsDeleting(true);
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
	}

	return (
		<>
			<motion.div
				exit={{ opacity: 0, scale: 0.95, height: 0 }}
				transition={{ duration: 0.15, ease: "easeOut" }}
				style={{ overflow: "hidden" }}
			>
				<SidebarMenuItem>
					<ContextMenu>
						<ContextMenuTrigger
							render={
								<SidebarMenuButton
									onClick={handleSelect}
									isActive={isActive}
									className="h-auto py-2 items-start text-left"
								>
									<SessionStatusDot
										className="mt-1.5"
										status={sessionStatusIndicator}
									/>
									<div className="flex-1 min-w-0">
										<div className="flex items-center justify-between gap-2 min-w-0">
											<span
												className="truncate text-sm font-medium flex-1 min-w-0"
												title={session.title}
											>
												{session.title}
											</span>
											{isDeleting ? (
												<Spinner className="size-3 text-muted-foreground" />
											) : (
												<SessionOriginBadge worktreeId={session.worktreeId} />
											)}
										</div>
										<div className="text-muted-foreground text-xs mt-0.5">
											{lastActivityLabel}
										</div>
									</div>
								</SidebarMenuButton>
							}
						/>

						<ContextMenuContent className="min-w-[160px]">
							<ContextMenuItem onClick={handleRename}>
								<PencilIcon className="size-4" />
								Rename
							</ContextMenuItem>
							<ContextMenuItem onClick={handleArchive}>
								<ArchiveIcon className="size-4" />
								Archive
							</ContextMenuItem>
							<ContextMenuItem onClick={handleCopyWorkingPath}>
								<CopyIcon className="size-4" />
								Copy working path
							</ContextMenuItem>
							<ContextMenuSeparator />
							<ContextMenuItem
								variant="destructive"
								onClick={() => setIsDeleteDialogOpen(true)}
							>
								<TrashIcon className="size-4" />
								Delete
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				</SidebarMenuItem>
			</motion.div>

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
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDelete}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
});
SessionItem.displayName = "SessionItem";

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
