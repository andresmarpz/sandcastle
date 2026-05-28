import { useAtomSet } from "@effect/atom-react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import type { ProjectId } from "@sandcastle/contracts";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { generateFriendlyName } from "@/lib/friendlyName";
import { Client } from "@/rpc/client";

type Props = {
	projectId: ProjectId;
	projectName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function NewWorkspaceDialog({
	projectId,
	projectName,
	open,
	onOpenChange,
}: Props): React.JSX.Element {
	const [name, setName] = useState(() => generateFriendlyName());
	const [branch, setBranch] = useState("");
	const [baseBranch, setBaseBranch] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const createWorkspace = useAtomSet(Client.mutation("workspaces.create"), { mode: "promise" });

	useEffect(() => {
		if (open) setName(generateFriendlyName());
	}, [open]);

	const reset = (): void => {
		setName(generateFriendlyName());
		setBranch("");
		setBaseBranch("");
		setError(null);
		setSubmitting(false);
	};

	const handleSubmit = async (e: React.FormEvent): Promise<void> => {
		e.preventDefault();
		setError(null);
		const trimmedName = name.trim();
		if (!trimmedName) {
			setError("Workspace name is required");
			return;
		}
		const trimmedBranch = branch.trim();
		const trimmedBase = baseBranch.trim();
		setSubmitting(true);
		try {
			await createWorkspace({
				payload: {
					projectId,
					name: trimmedName,
					config: {
						_tag: "worktree",
						...(trimmedBranch ? { branch: trimmedBranch } : {}),
						...(trimmedBase ? { baseBranch: trimmedBase } : {}),
					},
				},
				reactivityKeys: ["workspaces", projectId as string],
			});
			reset();
			onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			setSubmitting(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New workspace</DialogTitle>
					<DialogDescription>Create a git worktree in {projectName}.</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						void handleSubmit(e);
					}}
				>
					<label className="flex flex-col gap-1">
						<span className="text-xs text-muted-foreground">Name</span>
						<div className="flex items-center gap-1.5">
							<Input
								autoFocus
								placeholder="my-feature"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								aria-label="Regenerate name"
								title="Regenerate name"
								onClick={() => setName(generateFriendlyName())}
							>
								<ArrowsClockwiseIcon />
							</Button>
						</div>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-xs text-muted-foreground">
							Branch <span className="text-foreground-tertiary">(optional)</span>
						</span>
						<Input
							placeholder="sandcastle/…"
							value={branch}
							onChange={(e) => setBranch(e.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-xs text-muted-foreground">
							Base branch <span className="text-foreground-tertiary">(defaults to HEAD)</span>
						</span>
						<Input
							placeholder="main"
							value={baseBranch}
							onChange={(e) => setBaseBranch(e.target.value)}
						/>
					</label>
					<Button type="submit" size="sm" disabled={submitting || name.trim().length === 0}>
						{submitting ? "Creating…" : "Create workspace"}
					</Button>
					{error ? <p className="text-xs text-destructive">{error}</p> : null}
				</form>
			</DialogContent>
		</Dialog>
	);
}

export default NewWorkspaceDialog;
