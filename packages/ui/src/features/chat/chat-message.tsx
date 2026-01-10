import type { ChatMessage as ChatMessageType, MessageContent } from "@sandcastle/rpc";
import remarkBreaks from "remark-breaks";
import { defaultRemarkPlugins } from "streamdown";
import {
  Message,
  MessageContent as MessageContentWrapper,
  MessageResponse,
} from "../../components/ai-elements/message";
import {
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  ErrorBlock,
} from "./message-blocks";

// Extend default remark plugins (gfm, math, etc.) with remark-breaks for newline support
const remarkPlugins = [
  ...Object.values(defaultRemarkPlugins),
  remarkBreaks,
];

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <Message from={message.role}>
      <MessageContentWrapper>
        <ContentRenderer content={message.content} />
      </MessageContentWrapper>
    </Message>
  );
}

interface ContentRendererProps {
  content: MessageContent;
}

function ContentRenderer({ content }: ContentRendererProps) {
  switch (content.type) {
    case "text":
      return <MessageResponse remarkPlugins={remarkPlugins}>{content.text}</MessageResponse>;
    case "tool_use":
      return <ToolUseBlock toolName={content.toolName} input={content.input} />;
    case "tool_result":
      return (
        <ToolResultBlock
          toolName={content.toolName}
          output={content.output}
          isError={content.isError}
        />
      );
    case "thinking":
      return <ThinkingBlock text={content.text} />;
    case "error":
      return <ErrorBlock error={content.error} code={content.code} />;
    case "ask_user":
      return null; // Handled by AskUserModal
    default:
      return null;
  }
}

interface StreamingMessageProps {
  text: string;
}

export function StreamingMessage({ text }: StreamingMessageProps) {
  return (
    <Message from="assistant">
      <MessageContentWrapper>
        <MessageResponse remarkPlugins={remarkPlugins}>{text}</MessageResponse>
        <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
      </MessageContentWrapper>
    </Message>
  );
}
