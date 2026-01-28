"use client";

import { useAtom } from "@effect-atom/atom-react";
import type { Repository } from "@sandcastle/schemas";
import * as Option from "effect/Option";
import { useState } from "react";
import {
	REPOSITORY_LIST_KEY,
	updateRepositoryMutation,
} from "@/api/repository-atoms";
import { Button } from "@/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/dialog";
import { Label } from "@/components/label";
import { Textarea } from "@/components/textarea";

interface RepositorySettingsModalProps {
	repository: Repository;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function RepositorySettingsModal({
	repository,
	open,
	onOpenChange,
}: RepositorySettingsModalProps) {
	const [worktreeInitScript, setWorktreeInitScript] = useState(
		Option.getOrElse(repository.worktreeInitScript, () => ""),
	);
	const [updateResult, updateRepository] = useAtom(updateRepositoryMutation);
	const isSaving = updateResult.waiting;

	function handleSave() {
		updateRepository({
			payload: {
				id: repository.id,
				input: { worktreeInitScript: worktreeInitScript || undefined },
			},
			reactivityKeys: [REPOSITORY_LIST_KEY],
		});
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Repository Settings</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="worktreeInitScript">Worktree Init Script</Label>
						<Textarea
							id="worktreeInitScript"
							placeholder="bun install"
							value={worktreeInitScript}
							onChange={(e) => setWorktreeInitScript(e.target.value)}
							rows={3}
						/>
						<p className="text-muted-foreground text-xs">
							Command to run when creating new worktrees (e.g., install
							dependencies)
						</p>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
