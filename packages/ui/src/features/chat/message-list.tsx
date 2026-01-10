import { useRef, useEffect } from "react";
import { useAtomValue } from "@effect-atom/atom-react";
import type { ChatMessage } from "@sandcastle/rpc";
import { partialMessageFamily } from "@/api/chat-atoms";
import { MessageBubble } from "./message-bubble";
import { PixelSpinner } from "./pixel-spinner";

interface MessageListProps {
  messages: readonly ChatMessage[];
  isStreaming?: boolean;
  sessionId: string;
}

export function MessageList({ messages, isStreaming = false, sessionId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const partialMessage = useAtomValue(partialMessageFamily(sessionId));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, partialMessage?.text]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Start a conversation...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Show partial message being streamed */}
      {partialMessage && partialMessage.text && (
        <div className="flex gap-2 mb-3 justify-start">
          <div className="max-w-[80%] rounded-lg px-3 py-2 bg-muted">
            <div className="whitespace-pre-wrap break-words text-sm">
              {partialMessage.text}
              <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Show spinner when streaming but no partial text yet */}
      {isStreaming && !partialMessage?.text && (
        <div className="flex gap-2 mb-3 justify-start">
          <div className="max-w-[80%] rounded-lg px-3 py-2 bg-muted flex items-center">
            <PixelSpinner className="text-muted-foreground" />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
