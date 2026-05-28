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
	min = 276,
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
		// biome-ignore lint/a11y/useSemanticElements: <hr> cannot host pointer-resize behavior
		<div
			onPointerDown={onPointerDown}
			role="separator"
			tabIndex={0}
			aria-orientation="vertical"
			aria-label="Resize sidebar"
			aria-valuenow={width}
			aria-valuemin={min}
			aria-valuemax={max}
			className="group/resize absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-col-resize"
			style={{ left: `var(--sidebar-width)` }}
		>
			<span
				aria-hidden
				className="pointer-events-none absolute top-1/2 left-1/2 block h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40 opacity-0 transition-opacity duration-150 group-hover/resize:opacity-100"
			/>
		</div>
	);
}

export default SidebarResizeHandle;
