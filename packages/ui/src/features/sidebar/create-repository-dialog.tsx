import { useAtom } from "@effect-atom/atom-react";
import { IconFolderOpen } from "@tabler/icons-react";
import { useState } from "react";
import {
	createRepositoryMutation,
	REPOSITORY_LIST_KEY,
} from "@/api/repository-atoms";
import { Button } from "@/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/dialog";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { usePlatform } from "@/context/platform-context";

interface CreateRepositoryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateRepositoryDialog({
	open,
	onOpenChange,
}: CreateRepositoryDialogProps) {
	const { openDirectory } = usePlatform();
	const [, createRepository] = useAtom(createRepositoryMutation, {
		mode: "promiseExit",
	});

	const [label, setLabel] = useState("");
	const [directoryPath, setDirectoryPath] = useState("");
	const [defaultBranch, setDefaultBranch] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSelectDirectory = async () => {
		const path = await openDirectory();
		if (path) {
			setDirectoryPath(path);
			// Auto-fill label from directory name if empty
			if (!label) {
				const dirName = path.split("/").pop() || path.split("\\").pop() || "";
				setLabel(dirName);
			}
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!label.trim() || !directoryPath.trim()) return;

		setIsSubmitting(true);
		setError(null);

		try {
			const result = await createRepository({
				payload: {
					label: label.trim(),
					directoryPath: directoryPath.trim(),
					...(defaultBranch.trim() && { defaultBranch: defaultBranch.trim() }),
				},
				reactivityKeys: [REPOSITORY_LIST_KEY],
			});

			if (result._tag === "Success") {
				handleClose();
			} else {
				setError("Failed to create repository");
			}
		} catch {
			setError("An unexpected error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleClose = () => {
		setLabel("");
		setDirectoryPath("");
		setDefaultBranch("");
		setError(null);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Create repository</DialogTitle>
					<DialogDescription>
						Add a new repository to your workspace.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="directoryPath">Directory</Label>
						<div className="flex gap-2">
							<Input
								id="directoryPath"
								value={directoryPath}
								onChange={(e) => setDirectoryPath(e.target.value)}
								placeholder="/path/to/repository"
								className="flex-1"
								required
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={handleSelectDirectory}
							>
								<IconFolderOpen className="size-4" />
								<span className="sr-only">Browse</span>
							</Button>
						</div>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="label">Label</Label>
						<Input
							id="label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="My Repository"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="defaultBranch">
							Default branch{" "}
							<span className="text-muted-foreground font-normal">
								(optional)
							</span>
						</Label>
						<Input
							id="defaultBranch"
							value={defaultBranch}
							onChange={(e) => setDefaultBranch(e.target.value)}
							placeholder="main"
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isSubmitting || !label.trim() || !directoryPath.trim()}
						>
							{isSubmitting ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
