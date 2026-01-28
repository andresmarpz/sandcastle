"use client";

import { useAtom } from "@effect-atom/atom-react";
import type { Repository } from "@sandcastle/schemas";
import * as Option from "effect/Option";
import { type FormEvent, useState } from "react";
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
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/field";
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

	function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
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
				<form id="repository-settings-form" onSubmit={handleSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="worktreeInitScript">
								Worktree Init Script
							</FieldLabel>
							<Textarea
								id="worktreeInitScript"
								placeholder="bun install"
								value={worktreeInitScript}
								onChange={(e) => setWorktreeInitScript(e.target.value)}
								rows={3}
							/>
							<FieldDescription>
								Command to run when creating new worktrees (e.g., install
								dependencies)
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="repository-settings-form"
						disabled={isSaving}
					>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
