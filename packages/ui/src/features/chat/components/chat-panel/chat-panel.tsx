import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Session } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import * as Option from "effect/Option";
import { memo, useEffect, useMemo } from "react";
import { chatHistoryQuery } from "@/api/chat-atoms";
import { Spinner } from "@/components/spinner";
import { chatStore } from "../../store";
import { ChatPanelContent } from "./chat-panel-content";

interface ChatPanelProps {
	session: Session;
}

export const ChatPanel = memo(function ChatPanel({ session }: ChatPanelProps) {
	const historyResult = useAtomValue(chatHistoryQuery(session.id), (result) => {
		return result;
	});
	const cachedHistory = useMemo(() => {
		return Option.getOrElse(Result.value(historyResult), () => null);
	}, [historyResult]);

	useEffect(() => {
		if (cachedHistory) {
			chatStore
				.getState()
				.setHistory(
					session.id,
					cachedHistory.messages as unknown as UIMessage[],
				);
		}
	}, [cachedHistory, session.id]);

	return Result.matchWithWaiting(historyResult, {
		onWaiting: () => <ChatPanelLoading />,
		onError: () => <div>error</div>,
		onDefect: () => <div>defect</div>,
		onSuccess: (result) => (
			<ChatPanelContent
				initialMessages={result.value.messages as unknown as UIMessage[]}
				session={session}
			/>
		),
	});
});

function ChatPanelLoading() {
	return (
		<div className="flex h-full items-center justify-center text-muted-foreground">
			<Spinner className="mr-2" />
			Loading chat history...
		</div>
	);
}
