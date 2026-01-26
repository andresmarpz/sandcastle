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
import { SessionMetadataPanel } from "./session-metadata-panel";
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
			<div className="relative flex-1 min-h-0">
				<Conversation className="h-full">
					<ConversationContent className="relative grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr]">
						<div className="hidden sm:block" />

						<div className="flex flex-col gap-8 p-4 pb-20">
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
						</div>

						<div className="hidden sm:block self-start sticky top-4">
							<SessionMetadataPanel
								session={session}
								sessionId={session.id}
								messages={messages}
							/>
						</div>
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>
				<div className="pointer-events-none absolute bottom-0 left-0 right-0 grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr]">
					<div className="hidden sm:block" />
					<div className="h-24 bg-linear-to-b from-transparent to-sidebar" />
					<div className="hidden sm:block" />
				</div>
			</div>

			<footer className="shrink-0 grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr] pb-2">
				<div className="hidden sm:block" />
				<div>
					<ChatPanelMessageQueue sessionId={session.id} />
					<ChatPanelInput
						sessionId={session.id}
						workingPath={session.workingPath}
					/>
				</div>
				<div className="hidden sm:block" />
			</footer>
		</div>
	);
}
