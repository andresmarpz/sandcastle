"use client";

import { useAtom } from "@effect-atom/atom-react";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr";
import type { Repository } from "@sandcastle/schemas";
import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import {
	deleteRepositoryMutation,
	REPOSITORY_LIST_KEY,
} from "@/api/repository-atoms";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/alert-dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/context-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { Spinner } from "@/components/spinner";
import { cn } from "@/lib/utils";

interface RailRepositoryItemProps {
	repository: Repository;
}

function getInitials(label: string): string {
	const words = label.trim().split(/\s+/);
	if (words.length >= 2 && words[0]?.[0] && words[1]?.[0]) {
		return (words[0][0] + words[1][0]).toUpperCase();
	}
	return label.slice(0, 2).toUpperCase();
}

export function RailRepositoryItem({ repository }: RailRepositoryItemProps) {
	const location = useLocation();
	const navigate = useNavigate();

	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
	const [deleteResult, deleteRepository] = useAtom(deleteRepositoryMutation);
	const isDeleting = deleteResult.waiting;

	const isActive = location.pathname.startsWith(`/repository/${repository.id}`);
	const initials = getInitials(repository.label);

	function handleSelect() {
		navigate(`/repository/${repository.id}`);
	}

	function handleRepositoryDelete() {
		deleteRepository({
			payload: { id: repository.id },
			reactivityKeys: [REPOSITORY_LIST_KEY],
		});
		setIsDeleteDialogOpen(false);
	}

	return (
		<>
			<SidebarMenuItem>
				<ContextMenu>
					<ContextMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								onClick={handleSelect}
								isActive={isActive}
								className={cn(
									isActive &&
										"ring-[1.5px] ring-offset-[1.5px] ring-offset-border",
									"border-[1.5px] border-border",
								)}
							>
								{initials}
							</SidebarMenuButton>
						}
					/>

					<ContextMenuContent className="min-w-[160px]">
						<ContextMenuItem
							variant="destructive"
							onClick={() => setIsDeleteDialogOpen(true)}
						>
							<TrashIcon className="size-4" />
							Remove from list
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</SidebarMenuItem>

			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Remove repository?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove "{repository.label}" from your list. The
							repository files on disk will not be affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={handleRepositoryDelete}
							disabled={isDeleting}
						>
							{isDeleting ? (
								<>
									<Spinner className="size-4" />
									Removing...
								</>
							) : (
								"Remove"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
