import { useCallback, useEffect, useRef } from "react";

import { useSidebar } from "@/components/ui/sidebar";

type SidebarResizeHandleProps = {
	width: number;
	onWidthChange: (width: number) => void;
	onResizingChange?: (resizing: boolean) => void;
	min?: number;
	max?: number;
};

function SidebarResizeHandle({
	width,
	onWidthChange,
	onResizingChange,
	min = 240,
	max = 480,
}: SidebarResizeHandleProps): React.JSX.Element | null {
	const { state, isMobile } = useSidebar();
	const draggingRef = useRef(false);

	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			draggingRef.current = true;
			onResizingChange?.(true);
			const startX = e.clientX;
			const startWidth = width;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";

			const onMove = (ev: PointerEvent): void => {
				if (!draggingRef.current) return;
				const next = Math.min(max, Math.max(min, startWidth + (ev.clientX - startX)));
				onWidthChange(next);
			};
			const onUp = (): void => {
				draggingRef.current = false;
				onResizingChange?.(false);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[width, onWidthChange, onResizingChange, min, max],
	);

	useEffect(() => {
		return () => {
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, []);

	if (isMobile || state !== "expanded") return null;

	return (
		<div
			onPointerDown={onPointerDown}
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize sidebar"
			className="absolute top-1 bottom-2 z-20 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-sidebar-border"
			style={{ left: `calc(var(--sidebar-width) - 6px)` }}
		/>
	);
}

export default SidebarResizeHandle;
