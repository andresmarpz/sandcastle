import { useMatch } from "react-router";
import {
	SidebarContent,
	Sidebar as SidebarPrimitive,
	useSidebar,
} from "@/components/sidebar";
import { SessionList } from "@/features/sidebar/main/session-list";
import { WorktreeSection } from "@/features/sidebar/main/worktree-section";

export default function MainSidebar() {
	const match = useMatch("/repository/:repositoryId/*");
	const repositoryId = match?.params.repositoryId;
	const { open } = useSidebar();

	return (
		<SidebarPrimitive
			data-open={open}
			collapsible="none"
			className="flex flex-1 min-w-0 flex-col data-[open=true]:border-l border-t md:rounded-tl-md"
		>
			<SidebarContent className="flex-1 overflow-y-auto pt-2 px-2">
				{repositoryId ? <SessionList repositoryId={repositoryId} /> : null}
			</SidebarContent>

			{/* Worktree section at bottom - toggleable, max 20% height */}
			{repositoryId && <WorktreeSection repositoryId={repositoryId} />}
		</SidebarPrimitive>
	);
}
