"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Repository, Session } from "@sandcastle/schemas";
import { AnimatePresence } from "motion/react";
import { repositoryAtomFamily } from "@/api/repository-atoms";
import { sessionListByRepositoryAtomFamily } from "@/api/session-atoms";

import { SidebarMenu } from "@/components/sidebar";
import { Skeleton } from "@/components/skeleton";
import SidebarNewSession from "@/features/sidebar/main/sidebar-new-session";
import { SessionItem } from "./session-item";

interface SessionListProps {
	repositoryId: string;
}

function sortByLastActivity(sessions: readonly Session[]) {
	return [...sessions].sort(
		(a, b) =>
			new Date(b.lastActivityAt).getTime() -
			new Date(a.lastActivityAt).getTime(),
	);
}

export function SessionList({ repositoryId }: SessionListProps) {
	const sessionsResult = useAtomValue(
		sessionListByRepositoryAtomFamily(repositoryId),
	);
	const repositoryResult = useAtomValue(repositoryAtomFamily(repositoryId));

	const combinedResult = Result.all({
		sessions: sessionsResult,
		repository: repositoryResult,
	});

	return Result.matchWithWaiting(combinedResult, {
		onWaiting: () => <SessionListSkeleton />,
		onError: () => <SessionListError />,
		onDefect: () => <SessionListError />,
		onSuccess: ({ value: { sessions, repository } }) => (
			<SessionListContent
				sessions={sortByLastActivity(sessions)}
				repository={repository}
			/>
		),
	});
}

interface SessionListContentProps {
	sessions: readonly Session[];
	repository: Repository;
}

function SessionListContent({ sessions, repository }: SessionListContentProps) {
	return (
		<SidebarMenu>
			<SidebarNewSession repository={repository} />
			<AnimatePresence initial={false}>
				{sessions.map((session) => (
					<SessionItem
						key={session.id}
						session={session}
						repositoryId={repository.id}
					/>
				))}
			</AnimatePresence>
		</SidebarMenu>
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
