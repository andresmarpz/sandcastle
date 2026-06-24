import { GitDiffIcon, XIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { useReviewPanel } from "@/stores/reviewPanel";

// Fixed for now — a drag-to-resize handle (mirroring SidebarResizeHandle) is a
// follow-up once the panel actually renders diffs.
const PANEL_WIDTH = 360;

function ReviewPanel(): React.JSX.Element {
	const open = useReviewPanel((s) => s.open);
	const setOpen = useReviewPanel((s) => s.setOpen);

	return (
		// Docked flex sibling of SidebarInset. The outer box owns the width
		// transition (0 ↔ PANEL_WIDTH); the inner content keeps a fixed width and
		// is pinned to the right edge so it slides out toward the right as the box
		// collapses, rather than reflowing.
		<aside
			data-slot="review-panel"
			data-state={open ? "expanded" : "collapsed"}
			aria-hidden={!open}
			className="relative h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
			style={{ width: open ? PANEL_WIDTH : 0 }}
		>
			<div
				className={cn(
					"absolute inset-y-0 right-0 flex flex-col border-l border-sidebar-border bg-sidebar",
					// Once collapsed, drop the panel out of the tab order entirely.
					!open && "pointer-events-none",
				)}
				style={{ width: PANEL_WIDTH }}
				inert={!open}
			>
				<header className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
					<GitDiffIcon className="size-4 text-foreground-tertiary" />
					<span className="flex-1 text-xsm font-medium text-sidebar-foreground">Review</span>
					<button
						type="button"
						aria-label="Close Review panel"
						title="Close Review panel"
						onClick={() => setOpen(false)}
						className="grid size-6 place-items-center rounded text-foreground-tertiary hover:bg-sidebar-accent/60 hover:text-foreground"
					>
						<XIcon className="size-4" />
					</button>
				</header>
				<div className="flex min-h-0 flex-1 items-center justify-center p-4">
					<p className="text-center text-xs text-foreground-tertiary">Diff viewer coming soon.</p>
				</div>
			</div>
		</aside>
	);
}

export default ReviewPanel;
