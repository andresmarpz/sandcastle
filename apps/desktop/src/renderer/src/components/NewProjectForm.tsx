import { useAtomSet } from "@effect/atom-react";
import { FolderOpenIcon } from "@phosphor-icons/react";
import { AbsolutePath } from "@sandcastle/contracts";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Client } from "@/rpc/client";

function basenameOf(path: string): string {
	const parts = path.split(/[/\\]/).filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

type Props = {
	onSuccess?: () => void;
};

function NewProjectForm({ onSuccess }: Props = {}): React.JSX.Element {
	const [path, setPath] = useState("");
	const [error, setError] = useState<string | null>(null);

	const createProject = useAtomSet(Client.mutation("projects.create"), { mode: "promise" });

	const handlePick = async (): Promise<void> => {
		const picked = await window.api.dialog.pickDirectory();
		if (picked) setPath(picked);
	};

	const handleSubmit = async (e: React.FormEvent): Promise<void> => {
		e.preventDefault();
		setError(null);
		const trimmed = path.trim();
		if (!trimmed) {
			setError("Pick a directory first");
			return;
		}
		try {
			await createProject({
				payload: {
					name: basenameOf(trimmed),
					rootPath: AbsolutePath.make(trimmed),
				},
				reactivityKeys: ["projects"],
			});
			setPath("");
			onSuccess?.();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	return (
		<form
			className="flex flex-col gap-1.5 px-2 py-1.5"
			onSubmit={(e) => {
				void handleSubmit(e);
			}}
		>
			<div className="flex items-center gap-1.5">
				<Input placeholder="Project path…" value={path} onChange={(e) => setPath(e.target.value)} />
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					aria-label="Pick directory"
					onClick={() => {
						void handlePick();
					}}
				>
					<FolderOpenIcon />
				</Button>
			</div>
			<Button type="submit" size="sm" disabled={path.trim().length === 0}>
				Create project
			</Button>
			{error ? <p className="text-xs text-destructive">{error}</p> : null}
		</form>
	);
}

export default NewProjectForm;
