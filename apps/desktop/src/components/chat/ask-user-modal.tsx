"use client";

import { useState, useCallback } from "react";
import { useAtom } from "@effect-atom/atom-react";

import type { AskUserQuestionItem } from "@sandcastle/rpc";
import { chatRespondMutation } from "@sandcastle/ui/api/chat-atoms";
import { Button } from "@sandcastle/ui/components/button";
import { cn } from "@sandcastle/ui/lib/utils";

interface AskUserModalProps {
  sessionId: string;
  toolUseId: string;
  questions: readonly AskUserQuestionItem[];
  onClose: () => void;
}

interface QuestionCardProps {
  question: AskUserQuestionItem;
  selectedValues: string[];
  onSelect: (values: string[]) => void;
}

function QuestionCard({ question, selectedValues, onSelect }: QuestionCardProps) {
  const handleOptionClick = (label: string) => {
    if (question.multiSelect) {
      // Toggle selection for multi-select
      if (selectedValues.includes(label)) {
        onSelect(selectedValues.filter(v => v !== label));
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
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
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
              "w-full text-left p-3 rounded-lg border transition-colors",
              selectedValues.includes(option.label)
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                question.multiSelect ? "rounded" : "rounded-full",
                selectedValues.includes(option.label)
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30"
              )}>
                {selectedValues.includes(option.label) && (
                  <svg
                    className="w-2.5 h-2.5 text-primary-foreground"
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

export function AskUserModal({
  sessionId,
  toolUseId,
  questions,
  onClose
}: AskUserModalProps) {
  const [, respond] = useAtom(chatRespondMutation, { mode: "promiseExit" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track answers for each question by header
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    questions.forEach(q => {
      initial[q.header] = [];
    });
    return initial;
  });

  const handleSelectAnswer = useCallback((header: string, values: string[]) => {
    setAnswers(prev => ({
      ...prev,
      [header]: values
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validate that all questions have at least one answer
    const allAnswered = questions.every(q => {
      const selected = answers[q.header];
      return selected && selected.length > 0;
    });

    if (!allAnswered) return;

    setIsSubmitting(true);
    try {
      // Convert answers to the expected format (comma-separated for multi-select)
      const formattedAnswers: Record<string, string> = {};
      questions.forEach(q => {
        const selected = answers[q.header];
        if (selected) {
          formattedAnswers[q.header] = selected.join(", ");
        }
      });

      await respond({
        payload: {
          sessionId,
          toolUseId,
          answers: formattedAnswers
        },
        reactivityKeys: []
      });

      onClose();
    } catch (error) {
      console.error("Failed to respond to question:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [questions, answers, sessionId, toolUseId, respond, onClose]);

  // Check if all questions are answered
  const allAnswered = questions.every(q => {
    const selected = answers[q.header];
    return selected && selected.length > 0;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-card rounded-xl border border-border shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Claude needs your input</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Please answer the following questions to continue.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-6">
            {questions.map((question, index) => (
              <QuestionCard
                key={`${question.header}-${index}`}
                question={question}
                selectedValues={answers[question.header] ?? []}
                onSelect={(values) => handleSelectAnswer(question.header, values)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
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
