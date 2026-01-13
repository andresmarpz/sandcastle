import { useAtomValue } from "@effect-atom/atom-react";
import { FileIcon } from "lucide-react";
import { useMemo } from "react";
import { type FileMatch, fileSearchAtomFamily } from "@/api/files-atoms";
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/command";
import { splitPath } from "./utils";

// ─── File Search Results Components ───────────────────────────

interface FileSearchResultsInnerProps {
	atom: ReturnType<typeof fileSearchAtomFamily>;
	onSelect: (path: string) => void;
}

function FileSearchResultsInner({
	atom,
	onSelect,
}: FileSearchResultsInnerProps) {
	const result = useAtomValue(atom);

	if (result._tag === "Initial") {
		return <CommandEmpty>Searching...</CommandEmpty>;
	}

	if (result._tag === "Failure") {
		return <CommandEmpty>Error searching files</CommandEmpty>;
	}

	// result._tag === "Success"
	if (result.value.length === 0) {
		return <CommandEmpty>No files found</CommandEmpty>;
	}

	return (
		<CommandGroup>
			{result.value.map((file: FileMatch) => {
				const { directory, filename } = splitPath(file.path);
				return (
					<CommandItem
						key={file.path}
						value={file.path}
						onSelect={() => onSelect(file.path)}
						title={file.path}
					>
						<FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="flex min-w-0">
							{directory && (
								<span className="truncate text-muted-foreground">
									{directory}/
								</span>
							)}
							<span className="shrink-0">{filename}</span>
						</span>
					</CommandItem>
				);
			})}
		</CommandGroup>
	);
}

export interface FileSearchResultsProps {
	worktreeId: string;
	pattern: string;
	onSelect: (path: string) => void;
}

export function FileSearchResults({
	worktreeId,
	pattern,
	onSelect,
}: FileSearchResultsProps) {
	const atom = useMemo(() => {
		if (!pattern || pattern.length === 0) return null;
		return fileSearchAtomFamily({ worktreeId, pattern });
	}, [worktreeId, pattern]);

	if (!atom) {
		return (
			<CommandEmpty className="text-xs text-muted-foreground">
				Type to search files...
			</CommandEmpty>
		);
	}

	return <FileSearchResultsInner atom={atom} onSelect={onSelect} />;
}
