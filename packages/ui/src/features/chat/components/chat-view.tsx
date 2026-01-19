"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { GetHistoryResult } from "@sandcastle/rpc";
import type { ChatMessage, QueuedMessage, Session } from "@sandcastle/schemas";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/alert";
import { Badge } from "@/components/badge";
import { Spinner } from "@/components/spinner";
import { useChatSession, useSetChatHistory } from "@/features/chat/store";
import {
	SessionStatusDot,
	statusConfig,
	useSessionStatusIndicator,
} from "@/features/sidebar/sessions/session-status-indicator";
import { ChatInput } from "./chat-input";
import { GroupedMessageList } from "./grouped-message-list";

interface ChatViewProps {
	sessionId: string;
	worktreeId?: string;
}

type HistoryStatus = "loading" | "ready" | "error";

type QueuePart = NonNullable<QueuedMessage["parts"]>[number];
type QueueFilePart = Extract<QueuePart, { type: "file" }>;
type QueueTextPart = Extract<QueuePart, { type: "text" }>;

export function ChatView({ sessionId, worktreeId }: ChatViewProps) {
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
					worktreeId={worktreeId}
					initialMessages={initialMessages}
					historyStatus="loading"
				/>
			) : (
				<ChatHistoryLoading />
			),
		onError: () => (
			<ChatViewContent
				sessionId={sessionId}
				worktreeId={worktreeId}
				initialMessages={initialMessages}
				historyStatus="error"
			/>
		),
		onDefect: () => (
			<ChatViewContent
				sessionId={sessionId}
				worktreeId={worktreeId}
				initialMessages={initialMessages}
				historyStatus="error"
			/>
		),
		onSuccess: () => (
			<ChatViewContent
				sessionId={sessionId}
				worktreeId={worktreeId}
				initialMessages={initialMessages}
				historyStatus="ready"
			/>
		),
	});
}

interface ChatViewContentProps {
	sessionId: string;
	worktreeId?: string;
	initialMessages: UIMessage[];
	historyStatus: HistoryStatus;
}

function ChatViewContent({
	sessionId,
	worktreeId,
	initialMessages,
	historyStatus,
}: ChatViewContentProps) {
	const [autonomous, setAutonomous] = useState(false);

	// Fetch session data for metadata display
	const sessionResult = useAtomValue(sessionQuery(sessionId));

	// Use the global chat store instead of useChat + useSessionEvents
	const {
		messages,
		status: sessionStatus,
		queue,
		isConnected,
		error: sessionError,
		historyLoaded,
		sendMessage,
		stop,
	} = useChatSession(sessionId);

	// Set initial history when available
	const setHistory = useSetChatHistory(sessionId);
	useEffect(() => {
		if (initialMessages.length > 0 && !historyLoaded) {
			setHistory(initialMessages);
		}
	}, [initialMessages, historyLoaded, setHistory]);

	// Map session status to ChatStatus for ChatInput compatibility
	// AI SDK ChatStatus is 'submitted' | 'streaming' | 'ready' | 'error'
	const chatStatus: ChatStatus =
		sessionStatus === "streaming" ? "streaming" : "ready";

	const showHistoryLoading =
		historyStatus === "loading" && messages.length === 0;

	const errors = [
		historyStatus === "error"
			? {
					title: "History unavailable",
					message:
						"Unable to load saved messages. New updates will still stream.",
				}
			: null,
		sessionError
			? {
					title: "Session stream error",
					message: sessionError.message,
				}
			: null,
	].filter(Boolean) as Array<{ title: string; message: string }>;

	return (
		<div className="h-full w-full overflow-y-auto">
			<div className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr] min-h-full">
				{/* Left column - empty spacer (hidden on small screens) */}
				<div className="hidden sm:block" />

				{/* Center column - main content */}
				<div className="flex flex-col min-h-full">
					<header className="sticky top-0 w-full bg-background z-10">
						<div className="flex items-center justify-between px-4 py-3">
							<div className="flex items-center gap-2">
								<Badge
									variant={
										sessionStatus === "streaming" ? "default" : "secondary"
									}
								>
									{sessionStatus === "streaming" ? "Streaming" : "Idle"}
								</Badge>
								<Badge variant={isConnected ? "outline" : "destructive"}>
									{isConnected ? "Live" : "Offline"}
								</Badge>
								{historyStatus === "loading" && (
									<span className="flex items-center gap-2 text-muted-foreground text-xs">
										<Spinner className="size-3" />
										Syncing history
									</span>
								)}
							</div>
							{queue.length > 0 && (
								<Badge variant="outline">{queue.length} queued</Badge>
							)}
						</div>
						{errors.length > 0 && (
							<div className="flex flex-col gap-2 px-4 pb-3">
								{errors.map((error) => (
									<Alert key={error.title} variant="destructive">
										<AlertTitle>{error.title}</AlertTitle>
										<AlertDescription>{error.message}</AlertDescription>
									</Alert>
								))}
							</div>
						)}
					</header>

					<div className="flex-1">
						<Conversation>
							<ConversationContent>
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
							</ConversationContent>
							<ConversationScrollButton />
						</Conversation>
						{queue.length > 0 && <QueuePanel queue={queue} />}
					</div>

					<footer className="sticky bottom-0 w-full bg-background">
						<ChatInput
							worktreeId={worktreeId}
							onSend={sendMessage}
							onStop={stop}
							status={chatStatus}
							autonomous={autonomous}
							onAutonomousChange={setAutonomous}
						/>
					</footer>
				</div>

				{Result.matchWithWaiting(sessionResult, {
					onSuccess: (session) => (
						<div className="relative hidden sm:block">
							<SessionMetadataPanel
								session={session.value}
								status={sessionStatus}
								isConnected={isConnected}
							/>
						</div>
					),
					onDefect: () => null,
					onError: () => null,
					onWaiting: () => null,
				})}
				{/* Right column - session metadata (hidden on small screens) */}
			</div>
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
}

function SessionMetadataPanel({ session }: SessionMetadataPanelProps) {
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
		<div className="sticky top-0 p-4">
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
			</div>
		</div>
	);
}

function QueuePanel({ queue }: { queue: QueuedMessage[] }) {
	const label = queue.length === 1 ? "queued message" : "queued messages";

	return (
		<div className="px-4 pb-2">
			<Queue>
				<QueueSection defaultOpen={false}>
					<QueueSectionTrigger>
						<QueueSectionLabel count={queue.length} label={label} />
					</QueueSectionTrigger>
					<QueueSectionContent>
						<QueueList>
							{queue.map((message) => {
								const preview = getQueuePreview(message);
								const files = getQueueFileParts(message);

								return (
									<QueueItem key={message.id}>
										<div className="flex items-start gap-2">
											<QueueItemIndicator />
											<QueueItemContent>{preview}</QueueItemContent>
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
