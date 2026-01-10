import type { ChatMessage } from "@sandcastle/rpc";
import { cn } from "../../lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const content = message.content;

  const renderContent = () => {
    switch (content.type) {
      case "text":
        return (
          <div className="whitespace-pre-wrap break-words">{content.text}</div>
        );
      case "tool_use":
        return (
          <div className="text-xs">
            <div className="font-medium text-muted-foreground mb-1">
              Tool: {content.toolName}
            </div>
            <pre className="bg-muted/50 rounded p-2 overflow-x-auto">
              {JSON.stringify(content.input, null, 2)}
            </pre>
          </div>
        );
      case "tool_result":
        return (
          <div className="text-xs">
            <div className="font-medium text-muted-foreground mb-1">
              Result: {content.toolName}
            </div>
            <pre
              className={cn(
                "rounded p-2 overflow-x-auto",
                content.isError ? "bg-destructive/10" : "bg-muted/50",
              )}
            >
              {typeof content.output === "string"
                ? content.output
                : JSON.stringify(content.output, null, 2)}
            </pre>
          </div>
        );
      case "thinking":
        return (
          <div className="text-muted-foreground italic">{content.text}</div>
        );
      case "error":
        return <div className="text-destructive">{content.error}</div>;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2 mb-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {renderContent()}
      </div>
    </div>
  );
}
