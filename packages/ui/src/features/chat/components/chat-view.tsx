"use client";

import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import { X } from "@phosphor-icons/react";
import type { GetHistoryResult } from "@sandcastle/rpc";
import type { ChatMessage, QueuedMessage, Session } from "@sandcastle/schemas";
import type { ChatStatus, UIMessage } from "ai";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import { useCallback, useEffect, useMemo, useState } from "react";
import { chatHistoryQuery } from "@/api/chat-atoms";
import { sessionGitStatsQuery } from "@/api/git-atoms";
import {
	SESSION_LIST_KEY,
	sessionQuery,
	touchSessionMutation,
} from "@/api/session-atoms";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
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
	chatStore,
	type StreamingMetadata,
	useChatSession,
	usePendingExitPlanApproval,
	usePendingToolApprovals,
	useRespondToToolApproval,
	useSetChatHistory,
	useSetChatMode,
	useStreamingMetadata,
} from "@/features/chat/store";
import {
	SessionStatusDot,
	statusConfig,
	useSessionStatusIndicator,
} from "@/features/sidebar/main/session-status-indicator";
import { ChatInput } from "./chat-input";
import { isAskUserQuestionTool, isExitPlanModeTool } from "./group-messages";
import { GroupedMessageList } from "./grouped-message-list";
import { OpenPathButton } from "./open-path-button";
import {
	getRandomStreamingWord,
	StreamingIndicator,
} from "./streaming-indicator";
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
		mode,
		sendMessage,
		stop,
		dequeue,
	} = useChatSession(sessionId);

	// Mode can be updated by user or by server (after ExitPlanMode approval)
	const setMode = useSetChatMode(sessionId);

	// Set initial history when available
	const setHistory = useSetChatHistory(sessionId);
	useEffect(() => {
		if (initialMessages.length > 0 && !historyLoaded) {
			setHistory(initialMessages);
		}
	}, [initialMessages, historyLoaded, setHistory]);

	// Set up session rename handler for atom cache refresh
	// We use touchSession to trigger reactivity key invalidation which refreshes
	// all atoms subscribed to SESSION_LIST_KEY (including sessionListByRepositoryAtomFamily)
	const [, touchSession] = useAtom(touchSessionMutation, {
		mode: "promiseExit",
	});
	useEffect(() => {
		chatStore.getState().setOnSessionRenamed((renamedSessionId) => {
			// Touch the session to trigger cache invalidation via reactivity keys
			// The server already updated the title, but we need to invalidate
			// all session list atoms so they refetch with the new title
			touchSession({
				payload: { id: renamedSessionId },
				reactivityKeys: [SESSION_LIST_KEY, `session:${renamedSessionId}`],
			});
		});

		return () => {
			chatStore.getState().setOnSessionRenamed(null);
		};
	}, [touchSession]);

	// Tool approval hooks
	const pendingApprovals = usePendingToolApprovals(sessionId);
	const pendingPlanApproval = usePendingExitPlanApproval(sessionId);
	const respondToApproval = useRespondToToolApproval(sessionId);

	// Filter out ExitPlanMode and AskUserQuestion from generic approvals
	// (ExitPlanMode is handled by ChatInput, AskUserQuestion is rendered inline)
	const nonPlanApprovals = useMemo(
		() =>
			pendingApprovals.filter(
				(r) =>
					!isExitPlanModeTool(r.toolName) && !isAskUserQuestionTool(r.toolName),
			),
		[pendingApprovals],
	);

	// Plan approval handlers
	const handleApprovePlan = useCallback(() => {
		if (!pendingPlanApproval) return;
		respondToApproval({
			type: "tool-approval-response",
			toolCallId: pendingPlanApproval.toolCallId,
			toolName: pendingPlanApproval.toolName,
			approved: true,
			payload: { type: "ExitPlanModePayload" },
		});
	}, [pendingPlanApproval, respondToApproval]);

	const handleRejectPlan = useCallback(
		(feedback: string) => {
			if (!pendingPlanApproval) return;
			respondToApproval({
				type: "tool-approval-response",
				toolCallId: pendingPlanApproval.toolCallId,
				toolName: pendingPlanApproval.toolName,
				approved: false,
				payload: { type: "ExitPlanModePayload", feedback },
			});
		},
		[pendingPlanApproval, respondToApproval],
	);

	const handleCancelPlan = useCallback(() => {
		if (!pendingPlanApproval) return;
		respondToApproval({
			type: "tool-approval-response",
			toolCallId: pendingPlanApproval.toolCallId,
			toolName: pendingPlanApproval.toolName,
			approved: false,
			payload: { type: "ExitPlanModePayload" },
		});
	}, [pendingPlanApproval, respondToApproval]);

	// Map session status to ChatStatus for ChatInput compatibility
	// AI SDK ChatStatus is 'submitted' | 'streaming' | 'ready' | 'error'
	const chatStatus: ChatStatus =
		sessionStatus === "streaming" ? "streaming" : "ready";

	// Track streaming state for the loading indicator
	const [streamingState, setStreamingState] = useState<{
		startTime: number;
		word: string;
	} | null>(null);

	useEffect(() => {
		if (sessionStatus === "streaming" && streamingState === null) {
			setStreamingState({
				startTime: Date.now(),
				word: getRandomStreamingWord(),
			});
		} else if (sessionStatus !== "streaming" && streamingState !== null) {
			setStreamingState(null);
		}
	}, [sessionStatus, streamingState]);

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
							<>
								<GroupedMessageList messages={messages} sessionId={sessionId} />
								{streamingState && (
									<Message from="assistant">
										<MessageContent>
											<StreamingIndicator
												startTime={streamingState.startTime}
												word={streamingState.word}
											/>
										</MessageContent>
									</Message>
								)}
							</>
						) : (
							<ConversationEmptyState
								title="No messages yet"
								description="Send a message to start the session."
							/>
						)}

						{/* Tool approval dialogs - rendered inline after messages (excludes ExitPlanMode, handled by ChatInput) */}
						{nonPlanApprovals.length > 0 && (
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

			<footer className="shrink-0 grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,56rem)_1fr]">
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
						pendingPlanApproval={pendingPlanApproval}
						onApprovePlan={handleApprovePlan}
						onRejectPlan={handleRejectPlan}
						onCancelPlan={handleCancelPlan}
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

	// Real-time streaming metadata (updates immediately on finish events)
	const streamingMetadata = useStreamingMetadata(session.id);

	// Git stats for the session
	const gitStatsResult = useAtomValue(sessionGitStatsQuery(session.id));

	const createdAtLabel = useMemo(() => {
		if (!session?.createdAt) return null;
		const timestamp = Date.parse(session.createdAt);
		if (Number.isNaN(timestamp)) return null;
		return formatDistanceToNow(timestamp, { addSuffix: true });
	}, [session?.createdAt]);

	// Merge session data with streaming metadata (streaming takes precedence)
	const mergedMetadata = useMemo(
		(): StreamingMetadata => ({
			costUsd: streamingMetadata?.costUsd ?? session?.totalCostUsd ?? 0,
			inputTokens: streamingMetadata?.inputTokens ?? session?.inputTokens ?? 0,
			cacheReadInputTokens:
				streamingMetadata?.cacheReadInputTokens ??
				session?.cacheReadInputTokens ??
				0,
			cacheCreationInputTokens:
				streamingMetadata?.cacheCreationInputTokens ??
				session?.cacheCreationInputTokens ??
				0,
			contextWindow:
				streamingMetadata?.contextWindow ?? session?.contextWindow ?? 0,
		}),
		[streamingMetadata, session],
	);

	const formattedCost = useMemo(() => {
		const cost = mergedMetadata.costUsd ?? 0;
		if (cost === 0) return "$0.00";
		if (cost < 0.01) return `$${cost.toFixed(4)}`;
		return `$${cost.toFixed(2)}`;
	}, [mergedMetadata.costUsd]);

	const contextPercentage = useMemo(() => {
		// Context % = (input_tokens + all cache tokens from last response) / max_tokens
		// This represents what Claude "sees" in its context window
		const {
			inputTokens,
			cacheReadInputTokens,
			cacheCreationInputTokens,
			contextWindow,
		} = mergedMetadata;

		if (!contextWindow || contextWindow === 0) return null;

		// Input tokens + cache tokens (both read and creation) = full context Claude processes
		const totalContextUsed =
			(inputTokens ?? 0) +
			(cacheReadInputTokens ?? 0) +
			(cacheCreationInputTokens ?? 0);
		const percentage = (totalContextUsed / contextWindow) * 100;
		return Math.min(percentage, 100).toFixed(1);
	}, [mergedMetadata]);

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
					Context
				</span>
				<span className="text-foreground">
					{contextPercentage !== null ? `${contextPercentage}%` : "--"}
				</span>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs font-medium uppercase">
					Changes
				</span>
				{Result.matchWithWaiting(gitStatsResult, {
					onWaiting: () => (
						<span className="text-muted-foreground">Loading...</span>
					),
					onError: () => <span className="text-muted-foreground">--</span>,
					onDefect: () => <span className="text-muted-foreground">--</span>,
					onSuccess: (result) => {
						const stats = result.value;
						if (stats.filesChanged === 0) {
							return <span className="text-foreground">No changes</span>;
						}
						return (
							<span className="text-foreground">
								{stats.filesChanged} file{stats.filesChanged !== 1 ? "s" : ""}{" "}
								<span className="text-green-600">+{stats.insertions}</span>{" "}
								<span className="text-red-600">-{stats.deletions}</span>
							</span>
						);
					},
				})}
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
													<X className="size-3" />
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
