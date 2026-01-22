import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { GithubLogoIcon } from "@phosphor-icons/react/GithubLogo";
import { PlusIcon } from "@phosphor-icons/react/Plus";
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
					<PlusIcon className="size-5" />
					<span className="sr-only">Add project</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					sideOffset={4}
					className="min-w-[200px]"
				>
					<DropdownMenuItem onClick={handleOpenProject}>
						<FolderOpenIcon className="size-3" />
						Open project
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCloneFromGit}>
						<GithubLogoIcon className="size-3" />
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
