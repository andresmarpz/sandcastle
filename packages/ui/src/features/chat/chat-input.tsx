import { useState } from "react";
import { Button } from "../../components/button";
import { cn } from "../../lib/utils";
import { SendIcon } from "./send-icon";
import { StopIcon } from "./stop-icon";

interface ChatInputProps {
  onSend: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || disabled) return;
    onSend(prompt.trim());
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!prompt.trim() || disabled) return;
      onSend(prompt.trim());
      setPrompt("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3">
      <div className="flex gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Cmd+Enter to send)"
          className={cn(
            "flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            "placeholder:text-muted-foreground",
            "min-h-[40px] max-h-[120px]",
          )}
          rows={1}
          disabled={disabled || isStreaming}
        />
        {isStreaming ? (
          <Button
            type="button"
            onClick={onStop}
            variant="destructive"
            size="icon"
            className="shrink-0"
          >
            <StopIcon className="size-4" />
            <span className="sr-only">Stop</span>
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!prompt.trim() || disabled}
            size="icon"
            className="shrink-0"
          >
            <SendIcon className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        )}
      </div>
    </form>
  );
}
