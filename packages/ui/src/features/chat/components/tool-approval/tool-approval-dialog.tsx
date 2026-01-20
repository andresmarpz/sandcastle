"use client";

import type {
	AskUserQuestionPayload,
	ToolApprovalPayload,
	ToolApprovalResponse,
} from "@sandcastle/schemas";
import { useCallback } from "react";
import type { ToolApprovalRequest } from "@/features/chat/store";
import { AskUserQuestionApproval } from "./ask-user-question-approval";

interface ToolApprovalDialogProps {
	sessionId: string;
	request: ToolApprovalRequest;
	onRespond: (response: ToolApprovalResponse) => Promise<boolean>;
}

export function ToolApprovalDialog({
	sessionId: _sessionId,
	request,
	onRespond,
}: ToolApprovalDialogProps) {
	const handleAskUserQuestionRespond = useCallback(
		(approved: boolean, payload?: AskUserQuestionPayload) => {
			onRespond({
				type: "tool-approval-response",
				toolCallId: request.toolCallId,
				toolName: request.toolName,
				approved,
				payload,
			});
		},
		[request, onRespond],
	);

	// Generic handler for unknown tools
	const handleGenericRespond = useCallback(
		(approved: boolean, payload?: ToolApprovalPayload) => {
			onRespond({
				type: "tool-approval-response",
				toolCallId: request.toolCallId,
				toolName: request.toolName,
				approved,
				payload,
			});
		},
		[request, onRespond],
	);

	switch (request.toolName) {
		case "AskUserQuestion":
			return (
				<AskUserQuestionApproval
					request={request}
					onRespond={handleAskUserQuestionRespond}
				/>
			);

		// ExitPlanMode is now handled inline in ChatInput, not here

		default:
			// Fallback for unknown tools - simple approve/reject
			return (
				<div className="flex items-center gap-2 rounded-md border p-4">
					<span className="text-sm">
						Tool "{request.toolName}" requires approval
					</span>
					<button
						type="button"
						onClick={() => handleGenericRespond(true)}
						className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
					>
						Approve
					</button>
					<button
						type="button"
						onClick={() => handleGenericRespond(false)}
						className="rounded border px-3 py-1 text-sm"
					>
						Reject
					</button>
				</div>
			);
	}
}
