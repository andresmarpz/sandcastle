import type { AskUserQuestionQuestion } from "@sandcastle/schemas";
import { useCallback, useMemo, useState } from "react";

/** Answer state for a single question */
interface QuestionAnswerState {
	selectedIndices: Set<number>;
	customAnswer: string;
}

/** Persisted answers from tool output */
type PersistedAnswers =
	| Readonly<Record<string, string | readonly string[]>>
	| undefined;

/**
 * Initialize answer state from persisted answers.
 * Maps answer values back to option indices.
 */
function initializeFromPersisted(
	questions: readonly AskUserQuestionQuestion[],
	persistedAnswers: PersistedAnswers,
): Map<number, QuestionAnswerState> {
	const map = new Map<number, QuestionAnswerState>();

	for (let i = 0; i < questions.length; i++) {
		const question = questions[i];
		if (!question) continue;

		const key = String(i);
		const answer = persistedAnswers?.[key];

		if (!answer) {
			map.set(i, { selectedIndices: new Set(), customAnswer: "" });
			continue;
		}

		const answerValues = Array.isArray(answer) ? answer : [answer];
		const selectedIndices = new Set<number>();
		let customAnswer = "";

		for (const value of answerValues) {
			const optionIdx = question.options.findIndex(
				(opt) => opt.label === value,
			);
			if (optionIdx !== -1) {
				selectedIndices.add(optionIdx);
			} else {
				// Value doesn't match any option - it's a custom answer
				customAnswer = value;
			}
		}

		map.set(i, { selectedIndices, customAnswer });
	}

	return map;
}

/**
 * Hook for managing question answer state.
 * Handles option selection, custom answers, and payload building.
 */
export function useQuestionAnswers(
	questions: readonly AskUserQuestionQuestion[],
	persistedAnswers: PersistedAnswers,
) {
	const [answers, setAnswers] = useState<Map<number, QuestionAnswerState>>(() =>
		initializeFromPersisted(questions, persistedAnswers),
	);

	/** Get answer state for a question */
	const getAnswer = useCallback(
		(questionIdx: number): QuestionAnswerState => {
			return (
				answers.get(questionIdx) ?? {
					selectedIndices: new Set(),
					customAnswer: "",
				}
			);
		},
		[answers],
	);

	/** Toggle an option selection */
	const selectOption = useCallback(
		(questionIdx: number, optionIdx: number) => {
			const question = questions[questionIdx];
			if (!question) return;

			setAnswers((prev) => {
				const current = prev.get(questionIdx) ?? {
					selectedIndices: new Set(),
					customAnswer: "",
				};
				const newSelected = new Set(current.selectedIndices);

				if (question.multiSelect) {
					// Toggle for multi-select
					if (newSelected.has(optionIdx)) {
						newSelected.delete(optionIdx);
					} else {
						newSelected.add(optionIdx);
					}
				} else {
					// Replace for single-select
					newSelected.clear();
					newSelected.add(optionIdx);
				}

				const next = new Map(prev);
				next.set(questionIdx, {
					selectedIndices: newSelected,
					// Clear custom answer for single-select when option is selected
					customAnswer: question.multiSelect ? current.customAnswer : "",
				});
				return next;
			});
		},
		[questions],
	);

	/** Set custom answer text */
	const setCustomAnswer = useCallback(
		(questionIdx: number, value: string) => {
			const question = questions[questionIdx];
			if (!question) return;

			setAnswers((prev) => {
				const current = prev.get(questionIdx) ?? {
					selectedIndices: new Set(),
					customAnswer: "",
				};
				const next = new Map(prev);
				next.set(questionIdx, {
					// Clear selections for single-select when typing custom
					selectedIndices: question.multiSelect
						? current.selectedIndices
						: new Set(),
					customAnswer: value,
				});
				return next;
			});
		},
		[questions],
	);

	/** Check if a question has an answer */
	const isAnswered = useCallback(
		(questionIdx: number): boolean => {
			const answer = answers.get(questionIdx);
			if (!answer) return false;
			return answer.selectedIndices.size > 0 || answer.customAnswer.length > 0;
		},
		[answers],
	);

	/** Check if all questions are answered */
	const allAnswered = useMemo(() => {
		return questions.every((_, idx) => isAnswered(idx));
	}, [questions, isAnswered]);

	/** Build the payload for submission */
	const buildPayload = useCallback((): Record<string, string | string[]> => {
		const payload: Record<string, string | string[]> = {};

		for (let i = 0; i < questions.length; i++) {
			const question = questions[i];
			if (!question) continue;

			const answer = answers.get(i);
			if (!answer) continue;

			const key = String(i);

			if (question.multiSelect) {
				// Multi-select: combine selected options + custom answer into an array
				const selected = Array.from(answer.selectedIndices).map(
					(idx) => question.options[idx]?.label ?? "",
				);
				if (answer.customAnswer) {
					selected.push(answer.customAnswer);
				}
				payload[key] = selected;
			} else {
				// Single-select: either custom answer OR selected option (mutually exclusive)
				if (answer.customAnswer) {
					payload[key] = answer.customAnswer;
				} else {
					const selectedIdx = Array.from(answer.selectedIndices)[0];
					if (selectedIdx !== undefined) {
						payload[key] = question.options[selectedIdx]?.label ?? "";
					}
				}
			}
		}

		return payload;
	}, [questions, answers]);

	return {
		getAnswer,
		selectOption,
		setCustomAnswer,
		isAnswered,
		allAnswered,
		buildPayload,
	};
}
