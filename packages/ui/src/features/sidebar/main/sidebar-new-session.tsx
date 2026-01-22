import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react";
import {
	FolderIcon,
	GitBranchIcon,
	PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Repository, Worktree } from "@sandcastle/schemas";
import { Option } from "effect";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { createSessionMutation, SESSION_LIST_KEY } from "@/api/session-atoms";
import {
	createWorktreeMutation,
	WORKTREE_LIST_KEY,
	worktreeListByRepositoryAtomFamily,
} from "@/api/worktree-atoms";
import {
	DropdownMenu,
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

export default function SidebarNewSession({ repository }: Props) {
	const { id: repositoryId } = repository;
	const navigate = useNavigate();

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

	// Fetch worktree list
	const worktreesResult = useAtomValue(
		worktreeListByRepositoryAtomFamily(repositoryId),
	);
	const worktrees = useMemo(
		() => Option.getOrElse(Result.value(worktreesResult), () => []),
		[worktreesResult],
	);

	async function handleCreateSession(
		newWorktree: boolean,
		worktree?: Worktree,
	) {
		if (!repository || isDisabled) return;

		if (newWorktree) {
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
			return;
		}

		const result = await createSession({
			payload: {
				title: "New session",
				repositoryId,
				workingPath: worktree ? worktree.path : repository.directoryPath,
				worktreeId: worktree?.id,
			},
			reactivityKeys: [SESSION_LIST_KEY, `sessions:repository:${repositoryId}`],
		});

		if (result._tag === "Success") {
			navigate(`/repository/${repositoryId}/sessions/${result.value.id}`);
		}
	}

	const repoName = repository.directoryPath.split("/").pop();

	return (
		<SidebarMenuItem>
			<DropdownMenu>
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
						<DropdownMenuItem
							onClick={() => handleCreateSession(false)}
							className="font-medium!"
						>
							<FolderIcon className="size-4" />
							{repoName}
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>Worktrees</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => handleCreateSession(true)}
							className="text-muted-foreground"
						>
							<PlusIcon className="size-4" />
							Create new worktree
						</DropdownMenuItem>
						{worktrees.map((worktree) => (
							<DropdownMenuItem
								key={worktree.id}
								onClick={() => handleCreateSession(false, worktree)}
							>
								<GitBranchIcon className="size-4" />
								{worktree.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
}
