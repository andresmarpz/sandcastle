import { FolderOpen, GithubLogo, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { CreateRepositoryDialog } from "@/features/sidebar/create-repository-dialog";

export default function SidebarNewRepository() {
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	function handleOpenProject() {
		setCreateDialogOpen(true);
	}
	function handleCloneFromGit() {}

	return (
		<SidebarMenuItem>
			<DropdownMenu>
				<DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
					<Plus className="size-5" />
					<span className="sr-only">Add project</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					sideOffset={4}
					className="min-w-[200px]"
				>
					<DropdownMenuItem onClick={handleOpenProject}>
						<FolderOpen className="size-3" />
						Open project
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCloneFromGit}>
						<GithubLogo className="size-3" />
						Clone from Git
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<CreateRepositoryDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
			/>
		</SidebarMenuItem>
	);
}
