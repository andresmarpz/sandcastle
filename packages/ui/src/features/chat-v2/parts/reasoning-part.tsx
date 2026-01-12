import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

interface ReasoningPartProps {
	reasoning: string;
	isStreaming?: boolean;
}

export function ReasoningPart({
	reasoning,
	isStreaming = false,
}: ReasoningPartProps) {
	return (
		<Reasoning isStreaming={isStreaming} defaultOpen>
			<ReasoningTrigger />
			<ReasoningContent>{reasoning}</ReasoningContent>
		</Reasoning>
	);
}
