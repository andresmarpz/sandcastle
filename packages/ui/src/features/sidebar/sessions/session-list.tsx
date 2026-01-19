"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import type { Session } from "@sandcastle/schemas";
import { IconPlus } from "@tabler/icons-react";
import * as Option from "effect/Option";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { repositoryAtomFamily } from "@/api/repository-atoms";
import {
	createSessionMutation,
	SESSION_LIST_KEY,
	sessionListByRepositoryAtomFamily,
} from "@/api/session-atoms";
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

	const [createResult, createSession] = useAtom(createSessionMutation, {
		mode: "promiseExit",
	});
	const isCreating = createResult.waiting;

	const sessions = useMemo(
		() => Option.getOrElse(Result.value(sessionsResult), () => []),
		[sessionsResult],
	);

	const repository = useMemo(
		() => Option.getOrElse(Result.value(repositoryResult), () => null),
		[repositoryResult],
	);

	const hasSessionsCache = Option.isSome(Result.value(sessionsResult));

	const sortedSessions = useMemo(() => {
		return [...sessions].sort((a, b) => {
			const dateA = new Date(a.lastActivityAt).getTime();
			const dateB = new Date(b.lastActivityAt).getTime();
			return dateB - dateA;
		});
	}, [sessions]);

	async function handleCreateSession() {
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

	return Result.matchWithWaiting(sessionsResult, {
		onWaiting: () =>
			hasSessionsCache ? (
				<SessionListContent
					sessions={sortedSessions}
					repositoryId={repositoryId}
					onCreate={handleCreateSession}
					isCreating={isCreating}
				/>
			) : (
				<SessionListSkeleton />
			),
		onError: () =>
			hasSessionsCache ? (
				<SessionListContent
					sessions={sortedSessions}
					repositoryId={repositoryId}
					onCreate={handleCreateSession}
					isCreating={isCreating}
				/>
			) : (
				<SessionListError />
			),
		onDefect: () =>
			hasSessionsCache ? (
				<SessionListContent
					sessions={sortedSessions}
					repositoryId={repositoryId}
					onCreate={handleCreateSession}
					isCreating={isCreating}
				/>
			) : (
				<SessionListError />
			),
		onSuccess: () => (
			<SessionListContent
				sessions={sortedSessions}
				repositoryId={repositoryId}
				onCreate={handleCreateSession}
				isCreating={isCreating}
			/>
		),
	});
}

interface SessionListContentProps {
	sessions: readonly Session[];
	repositoryId: string;
	onCreate: () => void;
	isCreating: boolean;
	isLoading?: boolean;
}

function SessionListContent({
	sessions,
	repositoryId,
	onCreate,
	isCreating,
}: SessionListContentProps) {
	return (
		<>
			{sessions.map((session) => (
				<SessionItem
					key={session.id}
					session={session}
					repositoryId={repositoryId}
				/>
			))}
			<SidebarMenuItem>
				<SidebarMenuButton onClick={onCreate} disabled={isCreating}>
					{isCreating ? (
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
