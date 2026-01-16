"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Repository } from "@sandcastle/schemas";
import * as Option from "effect/Option";
import * as React from "react";
import { repositoryListAtom } from "@/api/repository-atoms";
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

export function Sidebar() {
	const repositoriesResult = useAtomValue(repositoryListAtom);
	const repositories = React.useMemo(
		() => Option.getOrElse(Result.value(repositoriesResult), () => []),
		[repositoriesResult],
	);
	const hasRepositoriesCache = Option.isSome(Result.value(repositoriesResult));

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

			<SidebarFooter className="border-border border-t p-2 flex items-center justify-end">
				<ThemeSwitcher />
			</SidebarFooter>

			<SidebarRail />
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
