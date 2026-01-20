"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { GetHistoryResult } from "@sandcastle/rpc";
import type { ChatMessage, QueuedMessage, Session } from "@sandcastle/schemas";
import { IconX } from "@tabler/icons-react";
import type { ChatStatus, UIMessage } from "ai";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import { useEffect, useMemo, useState } from "react";
import { chatHistoryQuery } from "@/api/chat-atoms";
import { sessionQuery } from "@/api/session-atoms";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Queue,
	QueueItem,
	QueueItemAction,
	QueueItemActions,
	QueueItemAttachment,
	QueueItemContent,
	QueueItemFile,
	QueueItemImage,
	QueueItemIndicator,
	QueueList,
	QueueSection,
	QueueSectionContent,
	QueueSectionLabel,
	QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { Spinner } from "@/components/spinner";
import {
	useChatSession,
	usePendingToolApprovals,
	useRespondToToolApproval,
	useSetChatHistory,
} from "@/features/chat/store";
import {
	SessionStatusDot,
	statusConfig,
	useSessionStatusIndicator,
} from "@/features/sidebar/sessions/session-status-indicator";
import { ChatInput } from "./chat-input";
import { GroupedMessageList } from "./grouped-message-list";
import { OpenPathButton } from "./open-path-button";
import { ToolApprovalDialog } from "./tool-approval";

interface ChatViewProps {
	sessionId: string;
	workingPath?: string;
}

type HistoryStatus = "loading" | "ready" | "error";

type QueuePart = NonNullable<QueuedMessage["parts"]>[number];
type QueueFilePart = Extract<QueuePart, { type: "file" }>;
type QueueTextPart = Extract<QueuePart, { type: "text" }>;

export function ChatView({ sessionId, workingPath }: ChatViewProps) {
	const historyResult = useAtomValue(chatHistoryQuery(sessionId));
	const cachedHistory = useMemo(
		() => Option.getOrElse(Result.value(historyResult), () => null),
		[historyResult],
	);
	const initialMessages = useMemo(
		() => mapHistoryToUiMessages(cachedHistory),
		[cachedHistory],
	);
	const hasHistoryCache = cachedHistory !== null;

	return Result.matchWithWaiting(historyResult, {
		onWaiting: () =>
			hasHistoryCache ? (
				<ChatViewContent
					sessionId={sessionId}
					workingPath={workingPath}
					initialMessages={initialMessages}
					historyStatus="loading"
				/>
			) : (
				<ChatHistoryLoading />
			),
		onError: () => (
			<ChatViewContent
				sessionId={sessionId}
				workingPath={workingPath}
				initialMessages={initialMessages}
				historyStatus="error"
			/>
		),
		onDefect: () => (
			<ChatViewContent
				sessionId={sessionId}
				workingPath={workingPath}
				initialMessages={initialMessages}
				historyStatus="error"
			/>
		),
		onSuccess: () => (
			<ChatViewContent
				sessionId={sessionId}
				workingPath={workingPath}
				initialMessages={initialMessages}
				historyStatus="ready"
			/>
		),
	});
}

interface ChatViewContentProps {
	sessionId: string;
	workingPath?: string;
	initialMessages: UIMessage[];
	historyStatus: HistoryStatus;
}

function ChatViewContent({
	sessionId,
	workingPath,
	initialMessages,
	historyStatus,
}: ChatViewContentProps) {
	const [mode, setMode] = useState<"plan" | "build">("plan");

	// Fetch session data for metadata display
	const sessionResult = useAtomValue(sessionQuery(sessionId));

	// Use the global chat store instead of useChat + useSessionEvents
	const {
		messages,
		status: sessionStatus,
		queue,
		isConnected,
		error: _sessionError,
		historyLoaded,
		sendMessage,
		stop,
		dequeue,
	} = useChatSession(sessionId);

	// Set initial history when available
	const setHistory = useSetChatHistory(sessionId);
	useEffect(() => {
		if (initialMessages.length > 0 && !historyLoaded) {
			setHistory(initialMessages);
		}
	}, [initialMessages, historyLoaded, setHistory]);

	// Tool approval hooks
	const pendingApprovals = usePendingToolApprovals(sessionId);
	const respondToApproval = useRespondToToolApproval(sessionId);

	// Map session status to ChatStatus for ChatInput compatibility
	// AI SDK ChatStatus is 'submitted' | 'streaming' | 'ready' | 'error'
	const chatStatus: ChatStatus =
		sessionStatus === "streaming" ? "streaming" : "ready";

	const showHistoryLoading =
		historyStatus === "loading" && messages.length === 0;

	// const errors = [
	// 	historyStatus === "error"
	// 		? {
	// 				title: "History unavailable",
	// 				message:
	// 					"Unable to load saved messages. New updates will still stream.",
	// 			}
	// 		: null,
	// 	sessionError
	// 		? {
	// 				title: "Session stream error",
	// 				message: sessionError.message,
	// 			}
	// 		: null,
	// ].filter(Boolean) as Array<{ title: string; message: string }>;

	return (
		<div className="flex h-full w-full flex-col">
			<Conversation className="flex-1 min-h-0">
				<ConversationContent className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr]">
					<div className="hidden sm:block" />

					<div className="flex flex-col gap-8 p-4 pb-12">
						{showHistoryLoading ? (
							<div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
								<Spinner className="mr-2" />
								Loading chat history...
							</div>
						) : messages.length > 0 ? (
							<GroupedMessageList messages={messages} />
						) : (
							<ConversationEmptyState
								title="No messages yet"
								description="Send a message to start the session."
							/>
						)}

						{/* Tool approval dialogs - rendered inline after messages */}
						{pendingApprovals.length > 0 && (
							<div className="flex flex-col gap-4">
								{pendingApprovals.map((request) => (
									<ToolApprovalDialog
										key={request.toolCallId}
										sessionId={sessionId}
										request={request}
										onRespond={respondToApproval}
									/>
								))}
							</div>
						)}
					</div>

					{Result.matchWithWaiting(sessionResult, {
						onSuccess: (session) => (
							<div className="sticky top-0 hidden self-start p-4 sm:block">
								<SessionMetadataPanel
									session={session.value}
									status={sessionStatus}
									isConnected={isConnected}
									workingPath={workingPath}
								/>
							</div>
						),
						onDefect: () => null,
						onError: () => null,
						onWaiting: () => null,
					})}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<footer className="shrink-0 bg-background grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr]">
				<div className="hidden sm:block" />
				<div>
					{queue.length > 0 && <QueuePanel queue={queue} onDequeue={dequeue} />}
					<ChatInput
						workingPath={workingPath}
						onSend={sendMessage}
						onStop={stop}
						status={chatStatus}
						mode={mode}
						onModeChange={setMode}
						autoFocus
					/>
				</div>
				<div className="hidden sm:block" />
			</footer>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Metadata Panel
// ─────────────────────────────────────────────────────────────────────────────

interface SessionMetadataPanelProps {
	session: Session;
	status: "idle" | "streaming";
	isConnected: boolean;
	workingPath?: string;
}

function SessionMetadataPanel({
	session,
	workingPath,
}: SessionMetadataPanelProps) {
	const sessionStatusIndicator = useSessionStatusIndicator({
		sessionId: session?.id,
		status: session?.status,
	});

	const createdAtLabel = useMemo(() => {
		if (!session?.createdAt) return null;
		const timestamp = Date.parse(session.createdAt);
		if (Number.isNaN(timestamp)) return null;
		return formatDistanceToNow(timestamp, { addSuffix: true });
	}, [session?.createdAt]);

	const formattedCost = useMemo(() => {
		const cost = session?.totalCostUsd ?? 0;
		if (cost === 0) return "$0.00";
		if (cost < 0.01) return `$${cost.toFixed(4)}`;
		return `$${cost.toFixed(2)}`;
	}, [session?.totalCostUsd]);

	const formattedTokens = useMemo(() => {
		const formatCount = (count: number) => {
			if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
			if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
			return count.toString();
		};
		const inputTokens = session?.inputTokens ?? 0;
		const outputTokens = session?.outputTokens ?? 0;
		return {
			input: formatCount(inputTokens),
			output: formatCount(outputTokens),
			total: formatCount(inputTokens + outputTokens),
		};
	}, [session?.inputTokens, session?.outputTokens]);

	return (
		<div className="flex flex-col gap-4 text-sm min-w-[240px]">
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs font-medium uppercase">
					Status
				</span>
				<div className="flex items-center gap-2">
					<SessionStatusDot status={sessionStatusIndicator} />

					<span className="text-foreground">
						{statusConfig[sessionStatusIndicator].label}
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs font-medium uppercase">
					Session
				</span>
				{createdAtLabel && (
					<span className="text-foreground">Created {createdAtLabel}</span>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs font-medium uppercase">
					Cost
				</span>
				<span className="text-foreground">{formattedCost}</span>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs font-medium uppercase">
					Tokens
				</span>
				<div className="flex flex-col gap-0.5 text-foreground">
					<span>
						<span className="text-muted-foreground">In:</span>{" "}
						{formattedTokens.input}
					</span>
					<span>
						<span className="text-muted-foreground">Out:</span>{" "}
						{formattedTokens.output}
					</span>
				</div>
			</div>

			{workingPath && (
				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs font-medium uppercase">
						Working Directory
					</span>
					<OpenPathButton path={workingPath} />
				</div>
			)}
		</div>
	);
}

function QueuePanel({
	queue,
	onDequeue,
}: {
	queue: QueuedMessage[];
	onDequeue: (messageId: string) => Promise<boolean>;
}) {
	const label = queue.length === 1 ? "queued message" : "queued messages";

	return (
		<div className="flex justify-center px-2 pt-2">
			<Queue className="w-[95%] rounded-b-none border-b-0">
				<QueueSection defaultOpen={true}>
					<QueueSectionTrigger>
						<QueueSectionLabel count={queue.length} label={label} />
					</QueueSectionTrigger>
					<QueueSectionContent>
						<QueueList>
							{queue.map((message) => {
								const preview = getQueuePreview(message);
								const files = getQueueFileParts(message);

								return (
									<QueueItem key={message.id} className="w-full py-2">
										<div className="flex w-full items-center gap-2">
											<QueueItemIndicator className="mt-0 shrink-0" />
											<QueueItemContent className="flex-1 min-w-0">
												{preview}
											</QueueItemContent>
											<QueueItemActions className="shrink-0 items-center">
												<QueueItemAction
													aria-label="Remove from queue"
													onClick={() => onDequeue(message.id)}
													className="flex items-center justify-center opacity-100"
												>
													<IconX className="size-3" />
												</QueueItemAction>
											</QueueItemActions>
										</div>
										{files.length > 0 && (
											<QueueItemAttachment>
												{files.map((file, index) =>
													file.mediaType.startsWith("image/") ? (
														<QueueItemImage
															key={`${message.id}-file-${index}`}
															src={file.url}
														/>
													) : (
														<QueueItemFile key={`${message.id}-file-${index}`}>
															{file.filename ?? "Attachment"}
														</QueueItemFile>
													),
												)}
											</QueueItemAttachment>
										)}
									</QueueItem>
								);
							})}
						</QueueList>
					</QueueSectionContent>
				</QueueSection>
			</Queue>
		</div>
	);
}

function ChatHistoryLoading() {
	return (
		<div className="flex h-full items-center justify-center text-muted-foreground">
			<Spinner className="mr-2" />
			Loading chat history...
		</div>
	);
}

function mapHistoryToUiMessages(history: GetHistoryResult | null): UIMessage[] {
	if (!history) return [];
	return history.messages.map(mapChatMessageToUi);
}

function mapChatMessageToUi(message: ChatMessage): UIMessage {
	return {
		id: message.id,
		role: message.role,
		parts: message.parts as UIMessage["parts"],
		...(message.metadata ? { metadata: message.metadata } : {}),
	};
}

function getQueuePreview(message: QueuedMessage): string {
	const trimmed = message.content.trim();
	if (trimmed) return trimmed;

	const textPart = message.parts?.find(
		(part): part is QueueTextPart =>
			part.type === "text" && "text" in part && typeof part.text === "string",
	);

	if (textPart?.text) {
		const text = textPart.text.trim();
		if (text) return text;
	}

	return "Queued message";
}

function getQueueFileParts(message: QueuedMessage): QueueFilePart[] {
	if (!message.parts) return [];
	return message.parts.filter(
		(part): part is QueueFilePart =>
			part.type === "file" &&
			"mediaType" in part &&
			"url" in part &&
			typeof part.mediaType === "string" &&
			typeof part.url === "string",
	);
}
