import ThemeSwitcher from "@/components/ThemeSwitcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const isMac =
	typeof navigator !== "undefined" && navigator.platform.toUpperCase().startsWith("MAC");

function TopBar(): React.JSX.Element {
	return (
		<header
			className={cn(
				"drag flex h-9 w-full shrink-0 items-center gap-1 pr-2",
				isMac ? "pl-[78px]" : "pl-2",
			)}
		>
			<SidebarTrigger className="no-drag" />
			<div className="flex-1" />
			<ThemeSwitcher />
		</header>
	);
}

export default TopBar;
