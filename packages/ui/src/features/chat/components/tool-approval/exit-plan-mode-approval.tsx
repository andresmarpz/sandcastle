"use client";

import type { ExitPlanModePayload } from "@sandcastle/schemas";
import { IconClipboardCheck, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/card";
import { Textarea } from "@/components/textarea";
import type { ToolApprovalRequest } from "@/features/chat/store";

interface ExitPlanModeApprovalProps {
	request: ToolApprovalRequest;
	onRespond: (approved: boolean, payload?: ExitPlanModePayload) => void;
}

export function ExitPlanModeApproval({
	request: _request,
	onRespond,
}: ExitPlanModeApprovalProps) {
	const [showFeedback, setShowFeedback] = useState(false);
	const [feedback, setFeedback] = useState("");

	const handleApprove = () => {
		onRespond(true, { type: "ExitPlanModePayload" });
	};

	const handleReject = () => {
		if (showFeedback && feedback.trim()) {
			onRespond(false, {
				type: "ExitPlanModePayload",
				feedback: feedback.trim(),
			});
		} else if (showFeedback) {
			// Show feedback form but no feedback entered - just reject
			onRespond(false, { type: "ExitPlanModePayload" });
		} else {
			// First click - show feedback form
			setShowFeedback(true);
		}
	};

	const handleRejectWithoutFeedback = () => {
		onRespond(false, { type: "ExitPlanModePayload" });
	};

	return (
		<Card size="sm" className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<IconClipboardCheck className="size-5 text-green-500" />
					Plan Ready for Review
				</CardTitle>
				<CardDescription>
					Claude has finished planning and is ready to implement. Review the
					plan above and approve to proceed.
				</CardDescription>
			</CardHeader>

			<CardContent>
				<p>{(_request.input as { plan?: string }).plan ?? ""}</p>
				{showFeedback && (
					<div className="space-y-2">
						<label
							htmlFor="feedback"
							className="text-sm font-medium text-muted-foreground"
						>
							Feedback (optional)
						</label>
						<Textarea
							id="feedback"
							placeholder="Explain what changes you'd like to the plan..."
							value={feedback}
							onChange={(e) => setFeedback(e.target.value)}
							rows={3}
						/>
					</div>
				)}
			</CardContent>

			<CardFooter className="justify-end gap-2">
				{showFeedback ? (
					<>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleRejectWithoutFeedback}
						>
							Reject without feedback
						</Button>
						<Button variant="outline" onClick={handleReject}>
							<IconX className="size-4" />
							{feedback.trim() ? "Reject with Feedback" : "Reject"}
						</Button>
					</>
				) : (
					<Button variant="outline" onClick={handleReject}>
						<IconX className="size-4" />
						Request Changes
					</Button>
				)}
				<Button onClick={handleApprove}>
					<IconClipboardCheck className="size-4" />
					Approve Plan
				</Button>
			</CardFooter>
		</Card>
	);
}
