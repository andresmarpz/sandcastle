"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import type { Session, Worktree } from "@sandcastle/schemas";
import { IconFolder, IconGitBranch, IconPlus } from "@tabler/icons-react";
import * as Option from "effect/Option";
import { AnimatePresence } from "motion/react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { repositoryAtomFamily } from "@/api/repository-atoms";
import {
	createSessionMutation,
	SESSION_LIST_KEY,
	sessionListByRepositoryAtomFamily,
} from "@/api/session-atoms";
import {
	createWorktreeMutation,
	WORKTREE_LIST_KEY,
	worktreeListByRepositoryAtomFamily,
} from "@/api/worktree-atoms";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { Skeleton } from "@/components/skeleton";
import { Spinner } from "@/components/spinner";
import { SessionItem } from "./session-item";

interface SessionListProps {
	repositoryId: string;
}

export function SessionList({ repositoryId }: SessionListProps) {
	const navigate = useNavigate();

	const sessionsResult = useAtomValue(
		sessionListByRepositoryAtomFamily(repositoryId),
	);
	const repositoryResult = useAtomValue(repositoryAtomFamily(repositoryId));
	const worktreesResult = useAtomValue(
		worktreeListByRepositoryAtomFamily(repositoryId),
	);

	const [createResult, createSession] = useAtom(createSessionMutation, {
		mode: "promiseExit",
	});
	const isCreating = createResult.waiting;

	const [createWorktreeResult, createWorktree] = useAtom(
		createWorktreeMutation,
		{ mode: "promiseExit" },
	);
	const isCreatingWorktree = createWorktreeResult.waiting;

	const sessions = useMemo(
		() => Option.getOrElse(Result.value(sessionsResult), () => []),
		[sessionsResult],
	);

	const repository = useMemo(
		() => Option.getOrElse(Result.value(repositoryResult), () => null),
		[repositoryResult],
	);

	const worktrees = useMemo(
		() => Option.getOrElse(Result.value(worktreesResult), () => []),
		[worktreesResult],
	);

	const isLoadingWorktrees =
		Result.isWaiting(worktreesResult) && worktrees.length === 0;

	const hasSessionsCache = Option.isSome(Result.value(sessionsResult));

	const sortedSessions = useMemo(() => {
		return [...sessions].sort((a, b) => {
			const dateA = new Date(a.lastActivityAt).getTime();
			const dateB = new Date(b.lastActivityAt).getTime();
			return dateB - dateA;
		});
	}, [sessions]);

	async function handleCreateSessionOnMain() {
		if (!repository || isCreating) return;

		const result = await createSession({
			payload: {
				repositoryId,
				workingPath: repository.directoryPath,
				title: "New session",
			},
			reactivityKeys: [SESSION_LIST_KEY, `sessions:repository:${repositoryId}`],
		});

		if (result._tag === "Success") {
			navigate(`/repository/${repositoryId}/sessions/${result.value.id}`);
		}
	}

	async function handleCreateSessionOnWorktree(worktree: Worktree) {
		if (!repository || isCreating) return;

		const result = await createSession({
			payload: {
				repositoryId,
				worktreeId: worktree.id,
				workingPath: worktree.path,
				title: "New session",
			},
			reactivityKeys: [SESSION_LIST_KEY, `sessions:repository:${repositoryId}`],
		});

		if (result._tag === "Success") {
			navigate(`/repository/${repositoryId}/sessions/${result.value.id}`);
		}
	}

	async function handleCreateWorktree() {
		if (isCreatingWorktree) return;

		const result = await createWorktree({
			payload: { repositoryId },
			reactivityKeys: [
				WORKTREE_LIST_KEY,
				`worktrees:repo:${repositoryId}`,
				SESSION_LIST_KEY,
				`sessions:repository:${repositoryId}`,
			],
		});

		if (result._tag === "Success") {
			navigate(
				`/repository/${repositoryId}/sessions/${result.value.initialSessionId}`,
			);
		}
	}

	const contentProps = {
		sessions: sortedSessions,
		repositoryId,
		onCreateOnMain: handleCreateSessionOnMain,
		onCreateOnWorktree: handleCreateSessionOnWorktree,
		onCreateWorktree: handleCreateWorktree,
		isCreating,
		isCreatingWorktree,
		worktrees,
		isLoadingWorktrees,
	};

	return Result.matchWithWaiting(sessionsResult, {
		onWaiting: () =>
			hasSessionsCache ? (
				<SessionListContent {...contentProps} />
			) : (
				<SessionListSkeleton />
			),
		onError: () =>
			hasSessionsCache ? (
				<SessionListContent {...contentProps} />
			) : (
				<SessionListError />
			),
		onDefect: () =>
			hasSessionsCache ? (
				<SessionListContent {...contentProps} />
			) : (
				<SessionListError />
			),
		onSuccess: () => <SessionListContent {...contentProps} />,
	});
}

interface SessionListContentProps {
	sessions: readonly Session[];
	repositoryId: string;
	onCreateOnMain: () => void;
	onCreateOnWorktree: (worktree: Worktree) => void;
	onCreateWorktree: () => void;
	isCreating: boolean;
	isCreatingWorktree: boolean;
	worktrees: readonly Worktree[];
	isLoadingWorktrees: boolean;
}

function SessionListContent({
	sessions,
	repositoryId,
	onCreateOnMain,
	onCreateOnWorktree,
	onCreateWorktree,
	isCreating,
	isCreatingWorktree,
	worktrees,
}: SessionListContentProps) {
	const isDisabled = isCreating || isCreatingWorktree;

	return (
		<>
			<AnimatePresence initial={false}>
				{sessions.map((session) => (
					<SessionItem
						key={session.id}
						session={session}
						repositoryId={repositoryId}
					/>
				))}
			</AnimatePresence>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						disabled={isDisabled}
						render={
							<SidebarMenuButton disabled={isDisabled}>
								{isDisabled ? (
									<>
										<Spinner className="size-4" />
										Creating...
									</>
								) : (
									<>
										<IconPlus className="size-3" />
										New session
									</>
								)}
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent
						align="start"
						sideOffset={4}
						className="min-w-[200px]"
					>
						<DropdownMenuItem onClick={onCreateOnMain}>
							<IconFolder className="size-4" />
							Main directory
						</DropdownMenuItem>

						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<IconGitBranch className="size-4" />
								Worktree
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent className="min-w-[180px]">
								<DropdownMenuItem onClick={onCreateWorktree}>
									<IconPlus className="size-4" />
									Create new worktree
								</DropdownMenuItem>

								{worktrees.length > 0 && <DropdownMenuSeparator />}
								{worktrees.map((worktree) => (
									<DropdownMenuItem
										key={worktree.id}
										onClick={() => onCreateOnWorktree(worktree)}
									>
										{worktree.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</>
	);
}

function SessionListSkeleton() {
	return (
		<div className="space-y-2 px-1 py-1">
			<Skeleton className="h-14 w-full" />
			<Skeleton className="h-14 w-full" />
			<Skeleton className="h-14 w-full" />
		</div>
	);
}

function SessionListError() {
	return (
		<div className="text-destructive text-sm px-2 py-8 text-center">
			Failed to load sessions
		</div>
	);
}
