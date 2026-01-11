import { BotIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
	usePromptInputController,
} from "../../components/ai-elements/prompt-input";
import { cn } from "../../lib/utils";

interface ChatInputProps {
	onSend: (prompt: string, autonomous: boolean) => void;
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

function ChatInputInner({
	onSend,
	onStop,
	isStreaming,
	disabled,
}: ChatInputProps) {
	const { textInput } = usePromptInputController();
	const [autonomous, setAutonomous] = useState(false);

	const handleSubmit = (message: PromptInputMessage) => {
		if (!message.text.trim() || disabled) return;
		onSend(message.text.trim(), autonomous);
	};

	const isEmpty = !textInput.value.trim();

	return (
		<div className="border-t border-border p-3">
			<PromptInput onSubmit={handleSubmit}>
				<PromptInputTextarea
					disabled={disabled || isStreaming}
					placeholder="Type a message..."
				/>
				<PromptInputFooter>
					<PromptInputButton
						onClick={() => setAutonomous(!autonomous)}
						variant={autonomous ? "default" : "ghost"}
						title={autonomous ? "Autonomous mode ON" : "Autonomous mode OFF"}
					>
						<BotIcon
							className={cn("size-4", autonomous && "text-primary-foreground")}
						/>
					</PromptInputButton>
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
