"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Repository } from "@sandcastle/schemas";
import { IconSettings } from "@tabler/icons-react";
import * as Option from "effect/Option";
import * as React from "react";
import { repositoryListAtom } from "@/api/repository-atoms";
import { Button } from "@/components/button";
import {
	SidebarContent,
	SidebarFooter,
	SidebarMenu,
	Sidebar as SidebarPrimitive,
	SidebarRail,
} from "@/components/sidebar";
import SidebarHeader from "@/components/sidebar/sidebar-header";
import { SidebarRepositoryItem } from "@/components/sidebar/sidebar-repository-item";
import { Skeleton } from "@/components/skeleton";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
	SettingsModal,
	type SettingsSection,
} from "@/features/settings/settings-modal";

export function Sidebar() {
	const repositoriesResult = useAtomValue(repositoryListAtom);
	const repositories = React.useMemo(
		() => Option.getOrElse(Result.value(repositoriesResult), () => []),
		[repositoriesResult],
	);
	const hasRepositoriesCache = Option.isSome(Result.value(repositoriesResult));

	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [settingsSection, setSettingsSection] =
		React.useState<SettingsSection>("chat");

	return (
		<SidebarPrimitive collapsible="offExamples">
			<SidebarHeader />

			<SidebarContent className="pt-2 px-2">
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
				</SidebarMenu>
			</SidebarContent>

			<SidebarFooter className="border-border border-t p-2 flex flex-row items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					className="flex-1 justify-start"
					onClick={() => setSettingsOpen(true)}
				>
					<IconSettings className="size-4" />
					<span>Settings</span>
				</Button>
				<ThemeSwitcher />
			</SidebarFooter>

			<SidebarRail />

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
		return (
			<div className="text-muted-foreground text-sm px-2 py-4 text-center">
				No repositories yet
			</div>
		);
	}

	return (
		<>
			{repositories.map((repo) => (
				<SidebarRepositoryItem key={repo.id} repository={repo} />
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
