import { SquareIcon } from "lucide-react";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputButton,
  PromptInputProvider,
  usePromptInputController,
  type PromptInputMessage,
} from "../../components/ai-elements/prompt-input";

interface ChatInputProps {
  onSend: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function ChatInput(props: ChatInputProps) {
  return (
    <PromptInputProvider>
      <ChatInputInner {...props} />
    </PromptInputProvider>
  );
}

function ChatInputInner({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const { textInput } = usePromptInputController();

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim() || disabled) return;
    onSend(message.text.trim());
  };

  const isEmpty = !textInput.value.trim();

  return (
    <div className="border-t border-border p-3">
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          disabled={disabled || isStreaming}
          placeholder="Type a message... (Enter to send)"
        />
        <PromptInputFooter>
          <div />
          {isStreaming ? (
            <PromptInputButton onClick={onStop} variant="destructive">
              <SquareIcon className="size-4" />
            </PromptInputButton>
          ) : (
            <PromptInputSubmit disabled={isEmpty || disabled} />
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
