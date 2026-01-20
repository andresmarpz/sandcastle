"use client";

import type { AskUserQuestionPayload } from "@sandcastle/schemas";
import {
	IconAlertTriangle,
	IconCheck,
	IconClock,
	IconMessageQuestion,
	IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import {
	Questions,
	QuestionsAction,
	QuestionsContent,
	QuestionsDescription,
	QuestionsFooter,
	QuestionsHeader,
	QuestionsTitle,
	QuestionsTrigger,
} from "@/components/ai-elements/questions";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import {
	useIsAnsweredQuestion,
	usePendingAskUserQuestionApproval,
	useRespondToToolApproval,
} from "@/features/chat/store";
import { cn } from "@/lib/utils";
import type { ToolCallPart } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Question {
	question: string;
	header: string;
	options: Array<{ label: string; description?: string }>;
	multiSelect: boolean;
}

interface AskUserQuestionInput {
	questions: Question[];
}

interface AskUserQuestionOutput {
	questions: Question[];
	answers?: Record<string, string | string[]>;
}

/**
 * Discriminated union representing all possible questions states.
 */
type QuestionsStatus =
	| { status: "streaming" }
	| { status: "pending" }
	| { status: "answered" }
	| { status: "skipped" }
	| { status: "error"; errorText: string };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the tool output to extract answers.
 * The output can be:
 * - A direct object with questions/answers
 * - A JSON string containing an array of content blocks
 * - An already-parsed array of content blocks
 */
function parseToolOutput(output: unknown): AskUserQuestionOutput | null {
	if (!output) return null;

	// Handle direct object with questions
	if (
		typeof output === "object" &&
		!Array.isArray(output) &&
		"questions" in output
	) {
		return output as AskUserQuestionOutput;
	}

	// If output is a string, try to parse it as JSON first
	let parsed = output;
	if (typeof output === "string") {
		try {
			parsed = JSON.parse(output);
		} catch {
			return null;
		}
	}

	// Handle text content array (from MCP tool output)
	if (Array.isArray(parsed)) {
		const textItem = parsed.find(
			(item: unknown) =>
				typeof item === "object" &&
				item !== null &&
				"type" in item &&
				item.type === "text",
		);
		if (textItem && "text" in textItem && typeof textItem.text === "string") {
			try {
				return JSON.parse(textItem.text) as AskUserQuestionOutput;
			} catch {
				return null;
			}
		}
	}

	// Handle parsed object with questions (after string parsing)
	if (typeof parsed === "object" && parsed !== null && "questions" in parsed) {
		return parsed as AskUserQuestionOutput;
	}

	return null;
}

/**
 * Map persisted answer values back to option indices.
 * Returns the selected indices and custom answer (if value doesn't match any option).
 */
function mapAnswerToSelection(
	question: Question,
	answer: string | string[] | undefined,
): { indices: Set<number>; customAnswer: string | undefined } {
	if (!answer) {
		return { indices: new Set(), customAnswer: undefined };
	}

	const answerValues = Array.isArray(answer) ? answer : [answer];
	const indices = new Set<number>();
	let customAnswer: string | undefined;

	for (const value of answerValues) {
		const optionIdx = question.options.findIndex((opt) => opt.label === value);
		if (optionIdx !== -1) {
			indices.add(optionIdx);
		} else {
			// Value doesn't match any option - it's a custom answer
			customAnswer = value;
		}
	}

	return { indices, customAnswer };
}

/**
 * Derive the questions status from available state.
 */
function deriveQuestionsStatus(
	part: ToolCallPart,
	isPendingApproval: boolean,
	isAnswered: boolean,
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
		const output = parseToolOutput(part.output);
		// If output has answers with at least one entry, it was answered
		if (output?.answers && Object.keys(output.answers).length > 0) {
			return { status: "answered" };
		}
		// If approved is explicitly false, it was skipped
		if (part.approved === false) {
			return { status: "skipped" };
		}
		// Output available but no answers = skipped
		return { status: "skipped" };
	}

	// 4. Check if answered via store (during active session)
	if (isAnswered) {
		// We can't distinguish between answered vs skipped here
		// because the store only tracks that a response was sent
		return { status: "answered" };
	}

	// 5. Check if pending (waiting for user response)
	if (isPendingApproval) {
		return { status: "pending" };
	}

	// 6. Default to skipped
	return { status: "skipped" };
}

/**
 * Get the description text for each questions status.
 */
function getStatusDescription(questionsStatus: QuestionsStatus): string {
	switch (questionsStatus.status) {
		case "streaming":
			return "Questions are being generated...";
		case "pending":
			return "Please answer the questions below.";
		case "answered":
			return "Questions have been answered.";
		case "skipped":
			return "Questions were skipped.";
		case "error":
			return `Questions failed: ${questionsStatus.errorText}`;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionsPartProps {
	part: ToolCallPart;
	sessionId: string;
}

export function QuestionsPart({ part, sessionId }: QuestionsPartProps) {
	const isAnswered = useIsAnsweredQuestion(sessionId, part.toolCallId);
	const pendingApproval = usePendingAskUserQuestionApproval(
		sessionId,
		part.toolCallId,
	);
	const isPendingApproval = pendingApproval !== null;
	const respondToApproval = useRespondToToolApproval(sessionId);

	// Parse persisted output to get answers
	const output = parseToolOutput(part.output);
	const persistedAnswers = output?.answers;

	// Extract questions from input (fallback to output.questions for reload case)
	const input = part.input as AskUserQuestionInput | undefined;
	const questions = input?.questions ?? output?.questions ?? [];

	// Derive questions status from state
	const questionsStatus = deriveQuestionsStatus(
		part,
		isPendingApproval,
		isAnswered,
	);

	// Initialize selections from persisted answers
	const [selections, setSelections] = useState<Map<string, Set<number>>>(() => {
		const map = new Map<string, Set<number>>();
		for (let i = 0; i < questions.length; i++) {
			const key = String(i);
			const question = questions[i];
			if (question && persistedAnswers?.[key]) {
				const { indices } = mapAnswerToSelection(
					question,
					persistedAnswers[key],
				);
				map.set(key, indices);
			} else {
				map.set(key, new Set());
			}
		}
		return map;
	});

	// Initialize customAnswers from persisted answers
	const [customAnswers, setCustomAnswers] = useState<Map<string, string>>(
		() => {
			const map = new Map<string, string>();
			for (let i = 0; i < questions.length; i++) {
				const key = String(i);
				const question = questions[i];
				if (question && persistedAnswers?.[key]) {
					const { customAnswer } = mapAnswerToSelection(
						question,
						persistedAnswers[key],
					);
					if (customAnswer) {
						map.set(key, customAnswer);
					}
				}
			}
			return map;
		},
	);

	const [activeTab, setActiveTab] = useState("0");

	// Controlled state for collapsible - start open when pending/streaming
	const shouldBeOpen =
		questionsStatus.status === "pending" ||
		questionsStatus.status === "streaming";
	const [isOpen, setIsOpen] = useState(shouldBeOpen);

	// Sync open state when status changes
	useEffect(() => {
		setIsOpen(shouldBeOpen);
	}, [shouldBeOpen]);

	const handleOptionClick = useCallback(
		(questionIdx: number, optionIdx: number) => {
			const question = questions[questionIdx];
			if (!question) return;

			const key = String(questionIdx);
			const current = selections.get(key) ?? new Set();

			if (question.multiSelect) {
				const newSet = new Set(current);
				if (newSet.has(optionIdx)) {
					newSet.delete(optionIdx);
				} else {
					newSet.add(optionIdx);
				}
				setSelections(new Map(selections).set(key, newSet));
			} else {
				setSelections(new Map(selections).set(key, new Set([optionIdx])));
				if (customAnswers.has(key)) {
					const newCustom = new Map(customAnswers);
					newCustom.delete(key);
					setCustomAnswers(newCustom);
				}
			}
		},
		[questions, selections, customAnswers],
	);

	const handleCustomChange = useCallback(
		(questionIdx: number, value: string) => {
			const key = String(questionIdx);
			const question = questions[questionIdx];
			if (!question) return;

			if (value) {
				setCustomAnswers(new Map(customAnswers).set(key, value));
				if (!question.multiSelect) {
					setSelections(new Map(selections).set(key, new Set()));
				}
			} else {
				const newCustom = new Map(customAnswers);
				newCustom.delete(key);
				setCustomAnswers(newCustom);
			}
		},
		[questions, selections, customAnswers],
	);

	const hasAnswerForQuestion = (questionIdx: number): boolean => {
		const key = String(questionIdx);
		const selectedOptions = selections.get(key);
		const customAnswer = customAnswers.get(key);
		return (selectedOptions && selectedOptions.size > 0) || !!customAnswer;
	};

	const allQuestionsAnswered = questions.every((_, idx) =>
		hasAnswerForQuestion(idx),
	);

	const handleSubmit = useCallback(() => {
		if (!pendingApproval) return;

		const answers: Record<string, string | string[]> = {};

		for (let i = 0; i < questions.length; i++) {
			const question = questions[i];
			if (!question) continue;

			const key = String(i);
			const selectedIndices = selections.get(key) ?? new Set();
			const customAnswer = customAnswers.get(key);

			if (customAnswer) {
				answers[key] = customAnswer;
			} else if (question.multiSelect) {
				answers[key] = Array.from(selectedIndices).map(
					(idx) => question.options[idx]?.label ?? "",
				);
			} else {
				const selectedIdx = Array.from(selectedIndices)[0];
				if (selectedIdx !== undefined) {
					answers[key] = question.options[selectedIdx]?.label ?? "";
				}
			}
		}

		const payload: AskUserQuestionPayload = {
			type: "AskUserQuestionPayload",
			answers,
		};

		respondToApproval({
			type: "tool-approval-response",
			toolCallId: part.toolCallId,
			toolName: pendingApproval.toolName,
			approved: true,
			payload,
		});
	}, [
		pendingApproval,
		part.toolCallId,
		questions,
		selections,
		customAnswers,
		respondToApproval,
	]);

	const handleSkip = useCallback(() => {
		if (!pendingApproval) return;

		respondToApproval({
			type: "tool-approval-response",
			toolCallId: part.toolCallId,
			toolName: pendingApproval.toolName,
			approved: false,
		});
	}, [pendingApproval, part.toolCallId, respondToApproval]);

	const showTabs = questions.length > 1;

	return (
		<div className="py-px">
			<Questions
				className="border border-border ring-0"
				isStreaming={questionsStatus.status === "streaming"}
				open={isOpen}
				onOpenChange={setIsOpen}
			>
				<QuestionsHeader className="flex-row items-start justify-between gap-4">
					<div className="flex items-start gap-2">
						<IconMessageQuestion className="size-5 text-blue-500 mt-0.5" />
						<div>
							<QuestionsTitle>Questions from Claude</QuestionsTitle>
							<QuestionsDescription>
								{getStatusDescription(questionsStatus)}
							</QuestionsDescription>
						</div>
					</div>
					<QuestionsAction className="flex items-center gap-2">
						<StatusBadge status={questionsStatus} />
						<QuestionsTrigger />
					</QuestionsAction>
				</QuestionsHeader>
				<QuestionsContent className="space-y-4">
					{showTabs ? (
						<Tabs value={activeTab} onValueChange={setActiveTab}>
							<TabsList variant="line">
								{questions.map((question, idx) => (
									<TabsTrigger
										key={idx}
										value={String(idx)}
										className={cn(
											hasAnswerForQuestion(idx) &&
												"text-green-600 dark:text-green-400",
										)}
									>
										{question.header}
									</TabsTrigger>
								))}
							</TabsList>
							{questions.map((question, qIdx) => (
								<TabsContent key={qIdx} value={String(qIdx)}>
									<QuestionContent
										question={question}
										questionIdx={qIdx}
										selections={selections}
										customAnswers={customAnswers}
										isPending={isPendingApproval}
										onOptionClick={handleOptionClick}
										onCustomChange={handleCustomChange}
									/>
								</TabsContent>
							))}
						</Tabs>
					) : questions.length === 1 ? (
						<QuestionContent
							question={questions[0]!}
							questionIdx={0}
							selections={selections}
							customAnswers={customAnswers}
							isPending={isPendingApproval}
							onOptionClick={handleOptionClick}
							onCustomChange={handleCustomChange}
						/>
					) : null}
				</QuestionsContent>
				{isPendingApproval && (
					<QuestionsFooter>
						<Button variant="outline" onClick={handleSkip}>
							Skip
						</Button>
						<Button onClick={handleSubmit} disabled={!allQuestionsAnswered}>
							Submit
						</Button>
					</QuestionsFooter>
				)}
			</Questions>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// QuestionContent
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionContentProps {
	question: Question;
	questionIdx: number;
	selections: Map<string, Set<number>>;
	customAnswers: Map<string, string>;
	isPending: boolean;
	onOptionClick: (questionIdx: number, optionIdx: number) => void;
	onCustomChange: (questionIdx: number, value: string) => void;
}

function QuestionContent({
	question,
	questionIdx,
	selections,
	customAnswers,
	isPending,
	onOptionClick,
	onCustomChange,
}: QuestionContentProps) {
	const key = String(questionIdx);

	return (
		<div className="space-y-3">
			<p className="text-sm font-medium">{question.question}</p>
			<div className="grid gap-2">
				{question.options.map((option, oIdx) => {
					const isSelected = selections.get(key)?.has(oIdx) ?? false;
					return (
						<button
							key={oIdx}
							type="button"
							onClick={() => isPending && onOptionClick(questionIdx, oIdx)}
							disabled={!isPending}
							className={cn(
								"flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
								isSelected
									? "border-primary bg-primary/5"
									: "border-border hover:border-primary/50 hover:bg-muted/50",
								!isPending && "cursor-default opacity-75",
							)}
						>
							<span className="text-sm font-medium">{option.label}</span>
							{option.description && (
								<span className="text-xs text-muted-foreground">
									{option.description}
								</span>
							)}
						</button>
					);
				})}
				{/* "Other" custom input */}
				<div
					className={cn(
						"rounded-md border p-3 transition-colors",
						customAnswers.has(key)
							? "border-primary bg-primary/5"
							: "border-border",
						!isPending && "opacity-75",
					)}
				>
					<input
						type="text"
						placeholder="Other (type your answer)..."
						value={customAnswers.get(key) ?? ""}
						onChange={(e) => onCustomChange(questionIdx, e.target.value)}
						disabled={!isPending}
						className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-default"
					/>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: QuestionsStatus }) {
	switch (status.status) {
		case "answered":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400">
					<IconCheck className="size-3" />
					Answered
				</Badge>
			);
		case "skipped":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-muted text-muted-foreground">
					<IconX className="size-3" />
					Skipped
				</Badge>
			);
		case "error":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
					<IconAlertTriangle className="size-3" />
					Failed
				</Badge>
			);
		case "pending":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
					<IconClock className="size-3" />
					Pending
				</Badge>
			);
		default:
			return null;
	}
}
