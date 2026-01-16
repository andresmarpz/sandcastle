import { IconBrandGithub, IconFolderOpen, IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarHeader as PrimitiveSidebarHeader } from "@/components/sidebar";

export default function SidebarHeader() {
	function handleOpenProject() {}
	function handleCloneFromGit() {}

	return (
		<PrimitiveSidebarHeader
			data-tauri-drag-region
			className="border-border flex-row items-center justify-between border-b h-12"
		>
			<span />
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
					<IconPlus className="size-3" />
					<span className="sr-only">Add project</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					sideOffset={4}
					className="min-w-[200px]"
				>
					<DropdownMenuItem onClick={handleOpenProject}>
						<IconFolderOpen className="size-3" />
						Open project
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCloneFromGit}>
						<IconBrandGithub className="size-3" />
						Clone from Git
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</PrimitiveSidebarHeader>
	);
}
