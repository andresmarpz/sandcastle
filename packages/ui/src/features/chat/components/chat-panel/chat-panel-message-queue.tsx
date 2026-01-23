import { XIcon } from "@phosphor-icons/react";
import type { QueuedMessage } from "@sandcastle/schemas";
import { memo } from "react";
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
import { useChatSession } from "../../store";

type QueuePart = NonNullable<QueuedMessage["parts"]>[number];
type QueueFilePart = Extract<QueuePart, { type: "file" }>;
type QueueTextPart = Extract<QueuePart, { type: "text" }>;

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

export const ChatPanelMessageQueue = memo(
	function ChatPanelMessageQueue({ sessionId }: { sessionId: string }) {
		const { queue, dequeue } = useChatSession(sessionId);
		const label = queue.length === 1 ? "queued message" : "queued messages";

		if (!queue.length) return null;

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
														onClick={() => dequeue(message.id)}
														className="flex items-center justify-center opacity-100"
													>
														<XIcon className="size-3" />
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
															<QueueItemFile
																key={`${message.id}-file-${index}`}
															>
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
	},
	(prev, next) => prev.sessionId === next.sessionId,
);
