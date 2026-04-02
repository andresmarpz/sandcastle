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
		<div className="flex h-full w-full flex-col">
			<div className="flex min-h-0 flex-1 flex-col items-center">
				<div className="relative flex min-h-0 w-full max-w-3xl flex-col overflow-hidden">
					<Conversation className="min-h-0 flex-1">
						<ConversationContent className="relative flex min-h-full flex-col gap-8 p-4 pb-20">
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
					<div className="pointer-events-none absolute bottom-0 left-0 right-0 z-50 h-24 bg-linear-to-b from-transparent to-sidebar" />
				</div>
			</div>
			<div className="z-10 mx-auto w-full max-w-3xl bg-sidebar py-2 flex flex-col justify-end">
				<ChatPanelMessageQueue sessionId={session.id} />
				{session.workingPaths.length > 1 && (
					<ul className="flex flex-wrap text-muted-foreground text-xs items-center w-fit">
						{session.workingPaths.map((path) => (
							<li
								key={path}
								title={path}
								className="flex gap-2 border border-border rounded-xl m-2 p-2 py-1 ml-4"
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
	);
}
