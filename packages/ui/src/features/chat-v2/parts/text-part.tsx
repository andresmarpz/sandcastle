import { MessageResponse } from "@/components/ai-elements/message";

interface TextPartProps {
	text: string;
}

export function TextPart({ text }: TextPartProps) {
	return <MessageResponse>{text}</MessageResponse>;
}
