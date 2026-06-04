import { ClockIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { ContextSummary } from "@/components/AutomationContextField";
import NewAutomationDialog, { type AutomationDraft } from "@/components/NewAutomationDialog";

type Automation = AutomationDraft & { id: string };

function AutomationsRoute(): React.JSX.Element {
	const [automations, setAutomations] = useState<Automation[]>([]);

	const handleCreate = (draft: AutomationDraft): void => {
		setAutomations((prev) => [{ id: crypto.randomUUID(), ...draft }, ...prev]);
	};

	const handleRemove = (id: string): void => {
		setAutomations((prev) => prev.filter((a) => a.id !== id));
	};

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-6">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-lg font-semibold">Automations</h1>
					<p className="text-xs text-muted-foreground">
						Schedule recurring Claude sessions that run on a cron schedule against a project or
						workspace.
					</p>
				</div>
				<NewAutomationDialog onCreate={handleCreate} />
			</header>

			{automations.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background/40 p-10 text-center">
					<div className="grid size-10 place-items-center rounded-full bg-sidebar-accent/60 text-foreground-tertiary">
						<ClockIcon className="size-5" weight="bold" />
					</div>
					<div className="space-y-1">
						<h2 className="text-sm font-medium">No automations yet</h2>
						<p className="max-w-sm text-xs text-muted-foreground">
							Automations are cron jobs that feed a prompt to Claude on a schedule, optionally with
							a project or workspace as context. Create one to get started.
						</p>
					</div>
				</div>
			) : (
				<ul className="flex flex-col gap-2">
					{automations.map((automation) => (
						<li
							key={automation.id}
							className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">{automation.name}</p>
									<p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
										<ClockIcon className="size-3.5 shrink-0" />
										{automation.schedule.description}
										<code className="rounded border border-border bg-muted/40 px-1 py-0.5 font-mono text-[0.7rem]">
											{automation.schedule.expression}
										</code>
									</p>
								</div>
								<button
									type="button"
									aria-label="Delete automation"
									title="Delete automation"
									onClick={() => handleRemove(automation.id)}
									className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
								>
									<TrashIcon className="size-4" />
								</button>
							</div>
							<p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
								{automation.prompt}
							</p>
							<div className="flex items-center gap-1.5 text-xs">
								<ContextSummary context={automation.context} />
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default AutomationsRoute;
