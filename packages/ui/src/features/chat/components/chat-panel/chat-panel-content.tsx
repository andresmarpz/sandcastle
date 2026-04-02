import { FolderIcon } from "@phosphor-icons/react";
import type { Session } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useChatSession } from "../../store";
import { ChatPanelInput } from "./chat-panel-input";
import { ChatPanelMessageQueue } from "./chat-panel-message-queue";
import { ChatPanelMessages } from "./chat-panel-messages";
import { ContextUsageButton } from "./context-usage-button";
import { StreamingIndicator } from "./streaming-indicator";

export interface ChatPanelContentProps {
	session: Session;
	initialMessages: UIMessage[];
}

export function ChatPanelContent({
	session,
	initialMessages,
}: ChatPanelContentProps) {
	// This component contains:
	// - MessageList component
	// - SessionMetadata component
	// - Footer (chat input, queue panel, questions)

	const { messages: stateMessages, turnStartedAt } = useChatSession(session.id);

	const messages = stateMessages.length ? stateMessages : initialMessages;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden [--chat-content-max-width:62rem]">
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					<Conversation className="min-h-0 flex-1">
						<ConversationContent className="relative mx-auto flex min-h-full w-full max-w-[var(--chat-content-max-width)] flex-col gap-8 px-4 pt-12 pb-20">
							<ChatPanelMessages messages={messages} sessionId={session.id} />

							{turnStartedAt && (
								<Message from="assistant">
									<MessageContent>
										<StreamingIndicator
											key={`indicator_${turnStartedAt}`}
											startTime={turnStartedAt}
										/>
									</MessageContent>
								</Message>
							)}
						</ConversationContent>
						<ConversationScrollButton />
					</Conversation>
					<div className="pointer-events-none absolute left-0 right-0 top-0 z-50 h-16 bg-linear-to-b from-sidebar to-transparent" />
				</div>
			</div>
			<div className="z-10 flex w-full flex-col justify-end bg-sidebar py-2">
				<div className="mx-auto flex w-full max-w-[calc(var(--chat-content-max-width)+1rem)] flex-col justify-end">
					<ChatPanelMessageQueue sessionId={session.id} />
					{session.workingPaths.length > 1 && (
						<ul className="flex w-fit flex-wrap items-center text-xs text-muted-foreground">
							{session.workingPaths.map((path) => (
								<li
									key={path}
									title={path}
									className="m-2 ml-4 flex gap-2 rounded-xl border border-border p-2 py-1"
								>
									<FolderIcon className="size-4 text-muted-foreground" />
									{path.split("/").pop() ?? path}
								</li>
							))}
						</ul>
					)}
					<ChatPanelInput
						sessionId={session.id}
						workingPath={session.workingPath}
						contextUsageButton={
							<ContextUsageButton
								session={session}
								sessionId={session.id}
								messages={messages}
							/>
						}
					/>
				</div>
			</div>
		</div>
	);
}
