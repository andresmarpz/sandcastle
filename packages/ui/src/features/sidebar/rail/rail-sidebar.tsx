import { Result, useAtomValue } from "@effect-atom/atom-react";
import { GearIcon } from "@phosphor-icons/react/dist/ssr";
import type { Repository } from "@sandcastle/schemas";
import * as Option from "effect/Option";
import { useMemo, useState } from "react";
import { repositoryListAtom } from "@/api/repository-atoms";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	Sidebar as SidebarPrimitive,
} from "@/components/sidebar";
import { Skeleton } from "@/components/skeleton";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SettingsModal, type SettingsSection } from "@/features/settings";
import SidebarNewRepository from "@/features/sidebar/rail/rail-new-repository";
import { RailRepositoryItem } from "@/features/sidebar/rail/rail-repository-item";

export default function Rail() {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [settingsSection, setSettingsSection] =
		useState<SettingsSection>("chat");

	const repositoriesResult = useAtomValue(repositoryListAtom);
	const repositories = useMemo(
		() => Option.getOrElse(Result.value(repositoriesResult), () => []),
		[repositoriesResult],
	);
	const hasRepositoriesCache = Option.isSome(Result.value(repositoriesResult));

	return (
		<SidebarPrimitive
			collapsible="none"
			className="w-16! shrink-0 border-r-0 bg-background"
		>
			<SidebarContent>
				<SidebarGroup className="p-3">
					<SidebarGroupContent>
						<SidebarMenu className="gap-3">
							{Result.matchWithWaiting(repositoriesResult, {
								onWaiting: () =>
									hasRepositoriesCache ? (
										<RepositoryList repositories={repositories} />
									) : (
										<RepositoryListSkeleton />
									),
								onError: () =>
									hasRepositoriesCache ? (
										<RepositoryList repositories={repositories} />
									) : (
										<RepositoryListError />
									),
								onDefect: () =>
									hasRepositoriesCache ? (
										<RepositoryList repositories={repositories} />
									) : (
										<RepositoryListError />
									),
								onSuccess: () => <RepositoryList repositories={repositories} />,
							})}

							<SidebarNewRepository />
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="p-4">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton onClick={() => setSettingsOpen(true)}>
							<GearIcon className="size-5" />
						</SidebarMenuButton>
					</SidebarMenuItem>
					<ThemeSwitcher />
				</SidebarMenu>
			</SidebarFooter>
			<SettingsModal
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				section={settingsSection}
				onSectionChange={setSettingsSection}
			/>
		</SidebarPrimitive>
	);
}

interface RepositoryListProps {
	repositories: readonly Repository[];
}

function RepositoryList({ repositories }: RepositoryListProps) {
	if (repositories.length === 0) {
		return null;
	}

	return (
		<>
			{repositories.map((repo) => (
				<RailRepositoryItem key={repo.id} repository={repo} />
			))}
		</>
	);
}

function RepositoryListSkeleton() {
	return (
		<div className="space-y-1">
			<Skeleton className="size-10" />
			<Skeleton className="size-10" />
			<Skeleton className="size-10" />
		</div>
	);
}

function RepositoryListError() {
	return (
		<div className="text-destructive text-sm px-2 py-4 text-center">
			Failed to load repositories
		</div>
	);
}
