import { useSidebar } from "@/components/ui/sidebar";

import { useKeybinding } from "./useKeybinding";

function SidebarKeybindings(): null {
	const { toggleSidebar } = useSidebar();
	useKeybinding("sidebar.toggle", () => toggleSidebar());
	return null;
}

export default SidebarKeybindings;
