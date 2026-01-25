import type { Session } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { useChatSession } from "../../store";
import { StreamingIndicator } from "../streaming-indicator";
import { ChatPanelInput } from "./chat-panel-input";
import { ChatPanelMessageQueue } from "./chat-panel-message-queue";
import { ChatPanelMessages } from "./chat-panel-messages";

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
			<Conversation className="flex-1 min-h-0">
				<ConversationContent className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr]">
					<div className="hidden sm:block" />

					<div className="flex flex-col gap-8 p-4 pb-12">
						{/*<GroupedMessageList
										messages={messages}
										sessionId={sessionId}
									/>*/}
						<ChatPanelMessages messages={messages} />

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

						{/* Tool approval dialogs - rendered inline after messages (excludes ExitPlanMode, handled by ChatInput) */}
						{/*{nonPlanApprovals.length > 0 && (
								<div className="flex flex-col gap-4">
									{nonPlanApprovals.map((request) => (
										<ToolApprovalDialog
											key={request.toolCallId}
											sessionId={sessionId}
											request={request}
											onRespond={respondToApproval}
										/>
									))}
								</div>
							)}*/}
					</div>

					<div className="sticky top-0 hidden self-start p-4 sm:block">
						{/*<SessionMetadataPanel
								session={session.value}
								status={sessionStatus}
								isConnected={isConnected}
								workingPath={workingPath}
							/>*/}
					</div>
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

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
