"use client";

import type { AskUserQuestionItem } from "@sandcastle/rpc";
import { useCallback, useState } from "react";

import { Button } from "../../../components/button";
import { cn } from "../../../lib/utils";
import type { AskUserEvent } from "../lib/transport-types";

interface QuestionCardProps {
	question: AskUserQuestionItem;
	selectedValues: string[];
	onSelect: (values: string[]) => void;
}

function QuestionCard({
	question,
	selectedValues,
	onSelect,
}: QuestionCardProps) {
	const handleOptionClick = (label: string) => {
		if (question.multiSelect) {
			// Toggle selection for multi-select
			if (selectedValues.includes(label)) {
				onSelect(selectedValues.filter((v) => v !== label));
			} else {
				onSelect([...selectedValues, label]);
			}
		} else {
			// Single select
			onSelect([label]);
		}
	};

	return (
		<div className="space-y-3">
			<div>
				<div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{question.header}
				</div>
				<div className="text-sm font-medium">{question.question}</div>
			</div>
			<div className="space-y-2">
				{question.options.map((option) => (
					<button
						key={option.label}
						type="button"
						onClick={() => handleOptionClick(option.label)}
						className={cn(
							"w-full rounded-lg border p-3 text-left transition-colors",
							selectedValues.includes(option.label)
								? "border-primary bg-primary/5"
								: "border-border hover:border-muted-foreground/30",
						)}
					>
						<div className="flex items-start gap-3">
							<div
								className={cn(
									"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border-2",
									question.multiSelect ? "rounded" : "rounded-full",
									selectedValues.includes(option.label)
										? "border-primary bg-primary"
										: "border-muted-foreground/30",
								)}
							>
								{selectedValues.includes(option.label) && (
									<svg
										className="h-2.5 w-2.5 text-primary-foreground"
										viewBox="0 0 16 16"
										fill="currentColor"
									>
										<path d="M6.5 12.5l-4-4 1.5-1.5 2.5 2.5 5.5-5.5 1.5 1.5z" />
									</svg>
								)}
							</div>
							<div>
								<div className="text-sm font-medium">{option.label}</div>
								<div className="text-xs text-muted-foreground">
									{option.description}
								</div>
							</div>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

export interface AskUserDialogProps {
	event: AskUserEvent;
	onRespond: (answers: Record<string, string>) => Promise<void>;
	onClose?: () => void;
}

/**
 * Dialog component for AskUser events.
 * Renders questions and collects user responses.
 */
export function AskUserDialog({ event, onRespond, onClose }: AskUserDialogProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Track answers for each question by header
	const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
		const initial: Record<string, string[]> = {};
		for (const q of event.questions) {
			initial[q.header] = [];
		}
		return initial;
	});

	const handleSelectAnswer = useCallback((header: string, values: string[]) => {
		setAnswers((prev) => ({
			...prev,
			[header]: values,
		}));
	}, []);

	const handleSubmit = useCallback(async () => {
		// Validate that all questions have at least one answer
		const allAnswered = event.questions.every((q) => {
			const selected = answers[q.header];
			return selected && selected.length > 0;
		});

		if (!allAnswered) return;

		setIsSubmitting(true);
		try {
			// Convert answers to the expected format (comma-separated for multi-select)
			const formattedAnswers: Record<string, string> = {};
			for (const q of event.questions) {
				const selected = answers[q.header];
				if (selected) {
					formattedAnswers[q.header] = selected.join(", ");
				}
			}

			await onRespond(formattedAnswers);
			onClose?.();
		} catch (error) {
			console.error("Failed to respond to question:", error);
		} finally {
			setIsSubmitting(false);
		}
	}, [event.questions, answers, onRespond, onClose]);

	// Check if all questions are answered
	const allAnswered = event.questions.every((q) => {
		const selected = answers[q.header];
		return selected && selected.length > 0;
	});

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-background/80 backdrop-blur-sm"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose?.()}
			/>

			{/* Modal */}
			<div className="relative z-10 mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-lg">
				{/* Header */}
				<div className="border-b border-border px-6 py-4">
					<h2 className="text-lg font-semibold">Claude needs your input</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Please answer the following questions to continue.
					</p>
				</div>

				{/* Content */}
				<div className="max-h-[60vh] overflow-y-auto px-6 py-4">
					<div className="space-y-6">
						{event.questions.map((question, index) => (
							<QuestionCard
								key={`${question.header}-${index}`}
								question={question}
								selectedValues={answers[question.header] ?? []}
								onSelect={(values) =>
									handleSelectAnswer(question.header, values)
								}
							/>
						))}
					</div>
				</div>

				{/* Footer */}
				<div className="flex justify-end gap-3 border-t border-border px-6 py-4">
					{onClose && (
						<Button variant="outline" onClick={onClose} disabled={isSubmitting}>
							Cancel
						</Button>
					)}
					<Button
						onClick={handleSubmit}
						disabled={!allAnswered || isSubmitting}
					>
						{isSubmitting ? "Submitting..." : "Submit"}
					</Button>
				</div>
			</div>
		</div>
	);
}
