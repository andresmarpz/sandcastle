import { PlusIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";

import AutomationContextField, {
	type AutomationContext,
	EMPTY_CONTEXT,
} from "@/components/AutomationContextField";
import CronScheduleField, {
	type CronSchedule,
	DEFAULT_SCHEDULE,
} from "@/components/CronScheduleField";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type AutomationDraft = {
	name: string;
	prompt: string;
	schedule: CronSchedule;
	context: AutomationContext;
};

type Preset = { id: string; label: string; name: string; prompt: string };

// Ship-by-default starting points. The prompt is what Claude receives on every run.
const PRESETS: Preset[] = [
	{
		id: "babysit-pr",
		label: "Babysit a PR",
		name: "Babysit PR",
		prompt:
			"Check the status of the open pull request on this branch:\n" +
			"- If it has drifted from main, merge main into the branch to resolve the drift.\n" +
			"- If coworkers left new comments, summarize them and notify me.\n" +
			"- If CI is green and the PR is approved, squash-merge it into main.\n" +
			"Otherwise, report the current status and what it's waiting on.",
	},
	{
		id: "triage-issues",
		label: "Triage issues",
		name: "Triage new issues",
		prompt:
			"Review issues opened since the last run. For each one, suggest labels, a priority, " +
			"and the most likely area of the codebase it touches. Summarize the triage for me.",
	},
	{
		id: "dep-updates",
		label: "Dependency check",
		name: "Dependency check",
		prompt:
			"Check for outdated or vulnerable dependencies. Open a PR that bumps safe (patch/minor) " +
			"updates and list any major updates that need a human decision.",
	},
];

function Field({
	label,
	htmlFor,
	hint,
	children,
}: {
	label: string;
	htmlFor?: string;
	hint?: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<label htmlFor={htmlFor} className="text-xsm font-medium">
					{label}
				</label>
				{hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
			</div>
			{children}
		</div>
	);
}

type Props = {
	onCreate?: (draft: AutomationDraft) => void;
	triggerClassName?: string;
};

function NewAutomationDialog({ onCreate, triggerClassName }: Props): React.JSX.Element {
	const [open, setOpen] = useState(false);
	// Bumped on each open to remount the form subtree, resetting field-local state.
	const [formKey, setFormKey] = useState(0);
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [schedule, setSchedule] = useState<CronSchedule>(DEFAULT_SCHEDULE);
	const [context, setContext] = useState<AutomationContext>(EMPTY_CONTEXT);

	const nameId = useId();
	const promptId = useId();

	// Reset from the open event rather than an effect, so parent state matches the
	// freshly remounted child fields.
	const openDialog = (): void => {
		setName("");
		setPrompt("");
		setSchedule(DEFAULT_SCHEDULE);
		setContext(EMPTY_CONTEXT);
		setFormKey((k) => k + 1);
		setOpen(true);
	};

	const canSubmit = name.trim().length > 0 && prompt.trim().length > 0 && schedule.valid;

	const handleSubmit = (e: React.FormEvent): void => {
		e.preventDefault();
		if (!canSubmit) return;
		onCreate?.({ name: name.trim(), prompt: prompt.trim(), schedule, context });
		setOpen(false);
	};

	const applyPreset = (preset: Preset): void => {
		setName(preset.name);
		setPrompt(preset.prompt);
	};

	return (
		<>
			<Button
				type="button"
				variant="elevated"
				size="sm"
				onClick={openDialog}
				className={triggerClassName}
			>
				<PlusIcon />
				New automation
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>New automation</DialogTitle>
						<DialogDescription>
							A scheduled job that feeds a prompt to Claude on every run.
						</DialogDescription>
					</DialogHeader>

					<form key={formKey} onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4">
						<div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
							<Field label="Name" htmlFor={nameId}>
								<Input
									id={nameId}
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. Babysit PR #149"
									autoFocus
								/>
							</Field>

							<Field label="Schedule">
								<CronScheduleField onChange={setSchedule} />
							</Field>

							<Field label="Prompt" htmlFor={promptId} hint="Sent to Claude each run">
								<div className="flex flex-col gap-2">
									<Textarea
										id={promptId}
										value={prompt}
										onChange={(e) => setPrompt(e.target.value)}
										placeholder="Describe what Claude should do on each run…"
										className="min-h-28"
									/>
									<div className="flex flex-wrap items-center gap-1.5">
										<span className="text-xs text-muted-foreground">Start from a preset:</span>
										{PRESETS.map((preset) => (
											<button
												key={preset.id}
												type="button"
												onClick={() => applyPreset(preset)}
												className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground-tertiary transition-colors hover:bg-muted hover:text-foreground"
											>
												{preset.label}
											</button>
										))}
									</div>
								</div>
							</Field>

							<Field label="Context" hint="Optional">
								<AutomationContextField value={context} onChange={setContext} />
							</Field>
						</div>

						<DialogFooter>
							<DialogClose render={<Button type="button" variant="outline" size="sm" />}>
								Cancel
							</DialogClose>
							<Button type="submit" size="sm" disabled={!canSubmit}>
								Create automation
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}

export default NewAutomationDialog;
