import { Result, useAtomValue } from "@effect-atom/atom-react";
import * as Option from "effect/Option";
import { useMemo } from "react";
import { useParams } from "react-router";
import { sessionQuery } from "@/api/session-atoms";
import { Spinner } from "@/components/spinner";
import { ChatView } from "@/features/chat";

export function SessionPage() {
	const { repositoryId, sessionId } = useParams<{
		repositoryId: string;
		sessionId: string;
	}>();

	if (!sessionId || !repositoryId) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				No session selected
			</div>
		);
	}

	return <SessionPageContent sessionId={sessionId} />;
}

function SessionPageContent({ sessionId }: { sessionId: string }) {
	const sessionResult = useAtomValue(sessionQuery(sessionId));
	const session = useMemo(
		() => Option.getOrElse(Result.value(sessionResult), () => null),
		[sessionResult],
	);

	const hasSessionCache = session !== null;

	return Result.matchWithWaiting(sessionResult, {
		onWaiting: () =>
			hasSessionCache ? (
				<ChatView
					sessionId={sessionId}
					worktreeId={session.worktreeId ?? undefined}
				/>
			) : (
				<SessionLoading />
			),
		onError: () => (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Failed to load session
			</div>
		),
		onDefect: () => (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Failed to load session
			</div>
		),
		onSuccess: () => (
			<ChatView
				sessionId={sessionId}
				worktreeId={session?.worktreeId ?? undefined}
			/>
		),
	});
}

function SessionLoading() {
	return (
		<div className="flex h-full items-center justify-center text-muted-foreground">
			<Spinner className="mr-2" />
			Loading session...
		</div>
	);
}
