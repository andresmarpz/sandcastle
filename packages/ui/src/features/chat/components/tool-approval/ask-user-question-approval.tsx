"use client";

import { Question as QuestionIcon } from "@phosphor-icons/react";
import type { AskUserQuestionPayload } from "@sandcastle/schemas";
import { useState } from "react";
import { Button } from "@/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/card";
import type { ToolApprovalRequest } from "@/features/chat/store";
import { cn } from "@/lib/utils";

interface Question {
	question: string;
	header: string;
	options: Array<{ label: string; description?: string }>;
	multiSelect: boolean;
}

interface AskUserQuestionInput {
	questions: Question[];
}

interface AskUserQuestionApprovalProps {
	request: ToolApprovalRequest;
	onRespond: (approved: boolean, payload?: AskUserQuestionPayload) => void;
}

export function AskUserQuestionApproval({
	request,
	onRespond,
}: AskUserQuestionApprovalProps) {
	const input = request.input as AskUserQuestionInput;
	const questions = input.questions ?? [];

	// Track selected answers per question (key: question index, value: selected option indices)
	const [selections, setSelections] = useState<Map<string, Set<number>>>(
		() => new Map(questions.map((_, idx) => [String(idx), new Set()])),
	);
	const [customAnswers, setCustomAnswers] = useState<Map<string, string>>(
		() => new Map(),
	);

	const handleOptionClick = (questionIdx: number, optionIdx: number) => {
		const question = questions[questionIdx];
		if (!question) return;

		const key = String(questionIdx);
		const current = selections.get(key) ?? new Set();

		if (question.multiSelect) {
			// Toggle for multi-select
			const newSet = new Set(current);
			if (newSet.has(optionIdx)) {
				newSet.delete(optionIdx);
			} else {
				newSet.add(optionIdx);
			}
			setSelections(new Map(selections).set(key, newSet));
		} else {
			// Replace for single-select
			setSelections(new Map(selections).set(key, new Set([optionIdx])));
			// Clear custom answer if selecting an option
			if (customAnswers.has(key)) {
				const newCustom = new Map(customAnswers);
				newCustom.delete(key);
				setCustomAnswers(newCustom);
			}
		}
	};

	const handleCustomChange = (questionIdx: number, value: string) => {
		const key = String(questionIdx);
		const question = questions[questionIdx];
		if (!question) return;

		if (value) {
			setCustomAnswers(new Map(customAnswers).set(key, value));
			// Clear option selections if typing custom answer (single-select only)
			if (!question.multiSelect) {
				setSelections(new Map(selections).set(key, new Set()));
			}
		} else {
			const newCustom = new Map(customAnswers);
			newCustom.delete(key);
			setCustomAnswers(newCustom);
		}
	};

	const hasAnswerForQuestion = (questionIdx: number): boolean => {
		const key = String(questionIdx);
		const selectedOptions = selections.get(key);
		const customAnswer = customAnswers.get(key);
		return (selectedOptions && selectedOptions.size > 0) || !!customAnswer;
	};

	const allQuestionsAnswered = questions.every((_, idx) =>
		hasAnswerForQuestion(idx),
	);

	const handleSubmit = () => {
		const answers: Record<string, string | string[]> = {};

		for (let i = 0; i < questions.length; i++) {
			const question = questions[i];
			if (!question) continue;

			const key = String(i);
			const selectedIndices = selections.get(key) ?? new Set();
			const customAnswer = customAnswers.get(key);

			if (customAnswer) {
				// Custom "Other" answer
				answers[key] = customAnswer;
			} else if (question.multiSelect) {
				// Multi-select: return array of selected labels
				answers[key] = Array.from(selectedIndices).map(
					(idx) => question.options[idx]?.label ?? "",
				);
			} else {
				// Single-select: return the selected label
				const selectedIdx = Array.from(selectedIndices)[0];
				if (selectedIdx !== undefined) {
					answers[key] = question.options[selectedIdx]?.label ?? "";
				}
			}
		}

		onRespond(true, {
			type: "AskUserQuestionPayload",
			answers,
		});
	};

	return (
		<Card size="sm" className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<QuestionIcon className="size-5 text-blue-500" />
					Claude has a question
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{questions.map((question, qIdx) => (
					<div key={qIdx} className="space-y-3">
						<div className="flex items-start gap-2">
							<span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
								{question.header}
							</span>
						</div>
						<p className="text-sm font-medium">{question.question}</p>
						<div className="grid gap-2">
							{question.options.map((option, oIdx) => {
								const isSelected =
									selections.get(String(qIdx))?.has(oIdx) ?? false;
								return (
									<button
										key={oIdx}
										type="button"
										onClick={() => handleOptionClick(qIdx, oIdx)}
										className={cn(
											"flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
											isSelected
												? "border-primary bg-primary/5"
												: "border-border hover:border-primary/50 hover:bg-muted/50",
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
									customAnswers.has(String(qIdx))
										? "border-primary bg-primary/5"
										: "border-border",
								)}
							>
								<input
									type="text"
									placeholder="Other (type your answer)..."
									value={customAnswers.get(String(qIdx)) ?? ""}
									onChange={(e) => handleCustomChange(qIdx, e.target.value)}
									className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
								/>
							</div>
						</div>
					</div>
				))}
			</CardContent>
			<CardFooter className="justify-end gap-2">
				<Button variant="outline" onClick={() => onRespond(false)}>
					Skip
				</Button>
				<Button onClick={handleSubmit} disabled={!allQuestionsAnswered}>
					Submit
				</Button>
			</CardFooter>
		</Card>
	);
}
