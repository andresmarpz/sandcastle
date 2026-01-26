"use client";

import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { QuestionIcon } from "@phosphor-icons/react/Question";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import type { ToolCallPart } from "@sandcastle/schemas";
import {
	type AskUserQuestionInput,
	type AskUserQuestionPayload,
	parseAskUserQuestionOutput,
} from "@sandcastle/schemas";
import { memo, useCallback } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import {
	useIsAnsweredQuestion,
	usePendingAskUserQuestionApproval,
	useRespondToToolApproval,
} from "@/features/chat/store";
import { useQuestionAnswers } from "./use-question-answers";

type QuestionsStatus =
	| { status: "streaming" }
	| { status: "pending" }
	| { status: "answered" }
	| { status: "skipped" }
	| { status: "error"; errorText: string };

/**
 * Derive the questions status from available state.
 */
function deriveQuestionsStatus(
	part: ToolCallPart,
	isPendingApproval: boolean,
	isAnsweredInStore: boolean,
): QuestionsStatus {
	// 1. Check if streaming (still generating)
	if (part.state === "input-streaming") {
		return { status: "streaming" };
	}

	// 2. Check for errors (timeout, etc.)
	if (part.state === "output-error") {
		return {
			status: "error",
			errorText: part.errorText ?? "An unknown error occurred.",
		};
	}

	// 3. Output available - check output content for answers
	if (part.state === "output-available") {
		const output = parseAskUserQuestionOutput(part.output);
		// If output has answers with at least one entry, it was answered
		if (output?.answers && Object.keys(output.answers).length > 0) {
			return { status: "answered" };
		}
		// If approved is explicitly false, it was skipped
		if (part.approval?.approved === false) {
			return { status: "skipped" };
		}
		// Output available but no answers = skipped
		return { status: "skipped" };
	}

	// 4. Check if answered via store (during active session)
	if (isAnsweredInStore) {
		return { status: "answered" };
	}

	// 5. Check if pending (waiting for user response)
	if (isPendingApproval) {
		return { status: "pending" };
	}

	// 6. Default to skipped
	return { status: "skipped" };
}

interface QuestionsHeaderProps {
	status: QuestionsStatus;
	questionCount: number;
	answeredCount: number;
}

function QuestionsHeader({
	status,
	questionCount,
	answeredCount,
}: QuestionsHeaderProps) {
	if (status.status === "streaming") {
		return (
			<div className="flex items-center gap-2">
				<SpinnerGapIcon className="text-muted-foreground size-4 animate-spin" />
				<span className="text-muted-foreground text-sm">
					Loading questions...
				</span>
			</div>
		);
	}

	if (status.status === "error") {
		return (
			<div className="flex items-center gap-2">
				<WarningCircleIcon className="size-4 text-red-700 dark:text-red-400/80" />
				<span className="text-sm text-red-700 dark:text-red-400/80">
					{status.errorText}
				</span>
			</div>
		);
	}

	if (status.status === "skipped") {
		return (
			<div className="flex items-center gap-2">
				<QuestionIcon className="text-muted-foreground size-4" />
				<span className="text-muted-foreground text-sm">Questions skipped</span>
			</div>
		);
	}

	if (status.status === "answered") {
		return (
			<div className="flex items-center gap-2">
				<CheckCircleIcon className="size-4 text-green-500" />
				<span className="text-sm">
					Answered {answeredCount} of {questionCount}{" "}
					{questionCount === 1 ? "question" : "questions"}
				</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<QuestionIcon className="text-primary size-4" />
			<span className="text-sm">
				{answeredCount > 0 ? (
					<>
						{answeredCount} of {questionCount} answered
					</>
				) : (
					<>
						{questionCount} {questionCount === 1 ? "question" : "questions"}{" "}
						awaiting response
					</>
				)}
			</span>
		</div>
	);
}

interface QuestionsProps {
	part: ToolCallPart;
	sessionId: string;
}

export const Questions = memo(function Questions({
	part,
	sessionId,
}: QuestionsProps) {
	const isAnsweredInStore = useIsAnsweredQuestion(sessionId, part.toolCallId);
	const pendingApproval = usePendingAskUserQuestionApproval(
		sessionId,
		part.toolCallId,
	);
	const isPendingApproval = pendingApproval !== null;
	const respondToApproval = useRespondToToolApproval(sessionId);

	// Parse persisted output to get answers
	const output = parseAskUserQuestionOutput(part.output);
	const persistedAnswers = output?.answers;

	// Extract questions from input (fallback to output.questions for reload case)
	const input = part.input as AskUserQuestionInput | undefined;
	const questions = input?.questions ?? output?.questions ?? [];

	// Derive questions status from state
	const questionsStatus = deriveQuestionsStatus(
		part,
		isPendingApproval,
		isAnsweredInStore,
	);

	// Use the answer management hook
	const {
		getAnswer,
		selectOption,
		setCustomAnswer,
		isAnswered,
		allAnswered,
		buildPayload,
	} = useQuestionAnswers(questions, persistedAnswers);

	// Count answered questions
	const answeredCount = questions.filter((_, idx) => isAnswered(idx)).length;

	const handleSubmit = useCallback(() => {
		if (!pendingApproval) return;

		const payload: AskUserQuestionPayload = {
			type: "AskUserQuestionPayload",
			answers: buildPayload(),
		};

		respondToApproval({
			type: "tool-approval-response",
			toolCallId: part.toolCallId,
			toolName: pendingApproval.toolName,
			approved: true,
			payload,
		});
	}, [pendingApproval, part.toolCallId, respondToApproval, buildPayload]);

	const handleSkip = useCallback(() => {
		if (!pendingApproval) return;

		respondToApproval({
			type: "tool-approval-response",
			toolCallId: part.toolCallId,
			toolName: pendingApproval.toolName,
			approved: false,
		});
	}, [pendingApproval, part.toolCallId, respondToApproval]);

	// Expand by default when pending, collapse when completed
	const isCompleted =
		questionsStatus.status === "answered" ||
		questionsStatus.status === "skipped";

	// Stop auto-scroll when user interacts with the component
	const { stopScroll } = useStickToBottomContext();

	const handleClick = useCallback(() => {
		stopScroll();
	}, [stopScroll]);

	return (
		<Collapsible defaultOpen={!isCompleted} onOpenChange={handleClick}>
			{/* Stop scrolling on any interaction within this component */}
			<div
				className="border-border rounded-lg border"
				onClickCapture={handleClick}
			>
				<CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-t-lg p-3 transition-colors">
					<QuestionsHeader
						status={questionsStatus}
						questionCount={questions.length}
						answeredCount={answeredCount}
					/>
					<CaretDownIcon className="text-muted-foreground size-4 transition-transform in-data-panel-open:rotate-180" />
				</CollapsibleTrigger>

				<CollapsiblePanel>
					<div className="border-border border-t p-4">
						<Tabs defaultValue="0">
							<TabsList>
								{questions.map((q, qIdx) => (
									<TabsTrigger
										key={`${part.toolCallId}-tab-${q.header}`}
										value={String(qIdx)}
									>
										{q.header}
										{isAnswered(qIdx) && (
											<CheckIcon className="ml-1 size-3.5" />
										)}
									</TabsTrigger>
								))}
							</TabsList>

							{questions.map((q, qIdx) => {
								const { selectedIndices, customAnswer } = getAnswer(qIdx);

								return (
									<TabsContent
										key={`${part.toolCallId}-content-${q.header}`}
										value={String(qIdx)}
									>
										<div className="mt-4">
											<div className="font-medium">{q.question}</div>
											{q.multiSelect && (
												<div className="text-muted-foreground text-xs">
													(Select multiple)
												</div>
											)}

											<div className="mt-3 space-y-2">
												{q.options.map((opt, optIdx) => {
													const isSelected = selectedIndices.has(optIdx);
													return (
														<button
															key={`q${qIdx}-opt-${opt.label}`}
															type="button"
															onClick={() => selectOption(qIdx, optIdx)}
															disabled={!isPendingApproval}
															className={`w-full rounded-md border p-3 text-left transition-colors ${
																isSelected
																	? "border-primary bg-primary/10"
																	: "border-border"
															} ${!isPendingApproval ? "cursor-default opacity-60" : "cursor-pointer hover:border-primary/50"}`}
														>
															<div className="font-medium">{opt.label}</div>
															{opt.description && (
																<div className="text-muted-foreground mt-1 text-xs">
																	{opt.description}
																</div>
															)}
														</button>
													);
												})}

												{/* Custom "Other" input */}
												<input
													type="text"
													placeholder="Other (type your answer)..."
													value={customAnswer}
													onChange={(e) =>
														setCustomAnswer(qIdx, e.target.value)
													}
													disabled={!isPendingApproval}
													className={`w-full rounded-md border p-3 ${
														customAnswer
															? "border-primary bg-primary/10"
															: "border-border"
													} ${!isPendingApproval ? "opacity-60" : ""}`}
												/>
											</div>
										</div>
									</TabsContent>
								);
							})}
						</Tabs>

						{isPendingApproval && (
							<div className="mt-4 flex justify-end gap-2">
								<button
									type="button"
									onClick={handleSkip}
									className="rounded-md border px-4 py-2"
								>
									Skip
								</button>
								<button
									type="button"
									onClick={handleSubmit}
									disabled={!allAnswered}
									className={`bg-primary text-primary-foreground rounded-md px-4 py-2 ${
										!allAnswered ? "opacity-50" : ""
									}`}
								>
									Submit
								</button>
							</div>
						)}
					</div>
				</CollapsiblePanel>
			</div>
		</Collapsible>
	);
});
