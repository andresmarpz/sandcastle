import { useAtom } from "@effect-atom/atom-react";
import { GithubLogo } from "@phosphor-icons/react/dist/ssr";
import { useMatch } from "react-router";
import { createPRMutation } from "@/api/chat-atoms";
import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";
import { useChatStatus } from "@/features/chat/store";

export function CreatePRButton() {
	const match = useMatch("/repository/:repositoryId/sessions/:sessionId");

	// Only render on session pages
	if (!match?.params.sessionId) return null;

	return <CreatePRButtonInner sessionId={match.params.sessionId} />;
}

function CreatePRButtonInner({ sessionId }: { sessionId: string }) {
	const status = useChatStatus(sessionId);
	const isStreaming = status === "streaming";
	const [result, createPR] = useAtom(createPRMutation, {
		mode: "promiseExit",
	});

	const isLoading = result.waiting;
	const isDisabled = isStreaming || isLoading;

	const handleClick = () => {
		createPR({ payload: { sessionId } });
	};

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleClick}
			disabled={isDisabled}
		>
			{isLoading ? (
				<>
					<Spinner className="size-4" />
					Creating...
				</>
			) : (
				<>
					<GithubLogo className="size-4" />
					Create PR
				</>
			)}
		</Button>
	);
}
