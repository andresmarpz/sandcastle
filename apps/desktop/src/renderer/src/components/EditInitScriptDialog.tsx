import { useAtomSet } from "@effect/atom-react";
import type { ProjectId } from "@sandcastle/contracts";
import { useEffect, useId, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { Client } from "@/rpc/client";

type Props = {
	projectId: ProjectId;
	projectName: string;
	currentScript: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const PLACEHOLDER = "pnpm install && just init";

function EditInitScriptDialog({
	projectId,
	projectName,
	currentScript,
	open,
	onOpenChange,
}: Props): React.JSX.Element {
	const [script, setScript] = useState(currentScript ?? "");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const scriptId = useId();

	const setInitScript = useAtomSet(Client.mutation("projects.setInitScript"), {
		mode: "promise",
	});

	// Re-seed from the project's current script every time the dialog opens so it
	// always starts from the truth even if the script changed elsewhere.
	useEffect(() => {
		if (open) {
			setScript(currentScript ?? "");
			setError(null);
			setSubmitting(false);
		}
	}, [open, currentScript]);

	const handleSubmit = async (e: React.FormEvent): Promise<void> => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		const trimmed = script.trim();
		try {
			await setInitScript({
				// Blank clears the script; the server normalizes empty → null too.
				payload: { projectId, initScript: trimmed.length > 0 ? script : null },
				// Same key projectsListQuery subscribes to, so the updated initScript
				// flows back into the sidebar's project prop on success.
				reactivityKeys: ["projects"],
			});
			onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			setSubmitting(false);
		}
	};

	const unchanged = script === (currentScript ?? "");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Initialization script</DialogTitle>
					<DialogDescription>
						Runs once in each new worktree workspace of {projectName}, right after it's created —
						use it to install dependencies or set up hooks. Leave empty to disable.
					</DialogDescription>
				</DialogHeader>

				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						void handleSubmit(e);
					}}
				>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={scriptId} className="text-xsm font-medium">
							Script
						</label>
						<Textarea
							id={scriptId}
							value={script}
							onChange={(e) => setScript(e.target.value)}
							placeholder={PLACEHOLDER}
							className="min-h-28 font-mono text-xsm"
							autoFocus
							spellCheck={false}
						/>
						<p className="text-xs text-muted-foreground">
							Runs with <code className="font-mono">bash -lc</code> in the new worktree's directory.
							The project's local workspace is never initialized.
						</p>
					</div>

					<DialogFooter>
						<DialogClose render={<Button type="button" variant="outline" size="sm" />}>
							Cancel
						</DialogClose>
						<Button type="submit" size="sm" disabled={submitting || unchanged}>
							{submitting ? "Saving…" : "Save script"}
						</Button>
					</DialogFooter>
					{error ? <p className="text-xs text-destructive">{error}</p> : null}
				</form>
			</DialogContent>
		</Dialog>
	);
}

export default EditInitScriptDialog;
