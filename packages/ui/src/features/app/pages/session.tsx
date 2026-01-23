import { Result, useAtomValue } from "@effect-atom/atom-react";
import { useParams } from "react-router";
import { sessionQuery } from "@/api/session-atoms";
import { Spinner } from "@/components/spinner";
import { ChatPanel } from "@/features/chat/components/chat-panel/chat-panel";

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

	return Result.matchWithWaiting(sessionResult, {
		onWaiting: () => <SessionLoading />,
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
		onSuccess: (result) => <ChatPanel session={result.value} />,
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
