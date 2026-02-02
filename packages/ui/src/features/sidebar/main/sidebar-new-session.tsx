import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import {
	FolderIcon,
	GitBranchIcon,
	PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Repository } from "@sandcastle/schemas";
import { Option } from "effect";
import { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { repositoryListAtom } from "@/api/repository-atoms";
import { createSessionMutation, SESSION_LIST_KEY } from "@/api/session-atoms";
import {
	createWorktreeMutation,
	WORKTREE_LIST_KEY,
	worktreeListByRepositoryAtomFamily,
} from "@/api/worktree-atoms";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { Spinner } from "@/components/spinner";

interface Props {
	repository: Repository;
}

export const SidebarNewSession = memo(function SidebarNewSession({
	repository,
}: Props) {
	const { id: repositoryId } = repository;
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

	// Create session
	const [createResult, createSession] = useAtom(createSessionMutation, {
		mode: "promiseExit",
	});
	const isCreatingSession = createResult.waiting;

	// Create worktree
	const [createWorktreeResult, createWorktree] = useAtom(
		createWorktreeMutation,
		{ mode: "promiseExit" },
	);
	const isCreatingWorktree = createWorktreeResult.waiting;

	const isDisabled = isCreatingSession || isCreatingWorktree;

	const repositoriesResult = useAtomValue(repositoryListAtom);
	const repositories = useMemo(
		() => Option.getOrElse(Result.value(repositoriesResult), () => []),
		[repositoriesResult],
	);

	const worktreesResult = useAtomValue(
		worktreeListByRepositoryAtomFamily(repositoryId),
	);
	const worktrees = useMemo(
		() => Option.getOrElse(Result.value(worktreesResult), () => []),
		[worktreesResult],
	);

	const repoPath = repository.directoryPath;

	const setPathChecked = useCallback((path: string, checked: boolean) => {
		setSelectedPaths((prev) =>
			checked
				? prev.includes(path)
					? prev
					: [...prev, path]
				: prev.filter((p) => p !== path),
		);
	}, []);

	async function handleCreateWorktree() {
		if (!repository || isDisabled) return;
		setOpen(false);
		const result = await createWorktree({
			payload: { repositoryId },
			reactivityKeys: [
				WORKTREE_LIST_KEY,
				`worktrees:repo:${repositoryId}`,
				SESSION_LIST_KEY,
				`sessions:repository:${repositoryId}`,
			],
		});
		if (result._tag === "Success") {
			navigate(
				`/repository/${repositoryId}/sessions/${result.value.initialSessionId}`,
			);
		}
	}

	async function handleCreateSessionWithSelected() {
		if (!repository || isDisabled || selectedPaths.length === 0) return;
		setOpen(false);
		const workingPath = selectedPaths[0]!;
		const result = await createSession({
			payload: {
				title: "New session",
				repositoryId,
				workingPath,
				workingPaths: selectedPaths,
			},
			reactivityKeys: [SESSION_LIST_KEY, `sessions:repository:${repositoryId}`],
		});
		if (result._tag === "Success") {
			navigate(`/repository/${repositoryId}/sessions/${result.value.id}`);
		}
	}

	return (
		<SidebarMenuItem>
			<DropdownMenu
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (next) setSelectedPaths([repoPath]);
				}}
			>
				<DropdownMenuTrigger
					render={
						<SidebarMenuButton
							disabled={isDisabled}
							variant="outline"
							size="lg"
							className="mb-1"
						>
							{isDisabled ? (
								<>
									<Spinner className="size-4" />
									Creating...
								</>
							) : (
								<>
									<PlusIcon className="size-3" />
									New session
								</>
							)}
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent align="start" sideOffset={6} className="max-h-72">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Select one or more</DropdownMenuLabel>
						{repositories.map((repo) => (
							<DropdownMenuCheckboxItem
								key={repo.id}
								checked={selectedPaths.includes(repo.directoryPath)}
								onCheckedChange={(checked) =>
									setPathChecked(repo.directoryPath, checked === true)
								}
							>
								<FolderIcon className="size-4" />
								{repo.label}
							</DropdownMenuCheckboxItem>
						))}
						{worktrees.length > 0 &&
							worktrees.map((worktree) => (
								<DropdownMenuCheckboxItem
									key={worktree.id}
									checked={selectedPaths.includes(worktree.path)}
									onCheckedChange={(checked) =>
										setPathChecked(worktree.path, checked === true)
									}
								>
									<GitBranchIcon className="size-4" />
									{worktree.name}
								</DropdownMenuCheckboxItem>
							))}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={handleCreateSessionWithSelected}
						disabled={selectedPaths.length === 0}
						className="font-medium!"
					>
						<PlusIcon className="size-4" />
						Create session ({selectedPaths.length} selected)
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>
							<span>Worktrees</span>
							<span className="text-muted-foreground block text-xs font-normal normal-case mt-0.5">
								Additional checkouts of the same repo (different branches) in
								separate folders
							</span>
						</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={handleCreateWorktree}
							className="text-muted-foreground"
						>
							<PlusIcon className="size-4" />
							Create new worktree
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
});
SidebarNewSession.displayName = "SidebarNewSession";
