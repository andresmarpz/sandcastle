import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Repository } from "@sandcastle/schemas";
import { IconSettings } from "@tabler/icons-react";
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
			className="w-[calc(var(--sidebar-width-icon)+1px)]! shrink-0 border-r-0 bg-background"
		>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent className="px-1.5 md:px-0">
						<SidebarMenu>
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
			<SidebarFooter className="border-border border-t flex flex-col items-center gap-2 px-1.5 md:px-0">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton onClick={() => setSettingsOpen(true)}>
							<IconSettings className="size-4" />
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
		<div className="space-y-2 px-2 py-1">
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
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
