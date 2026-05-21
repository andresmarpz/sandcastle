import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProcKind } from "@/lib/procClassifier";
import { type ProcVisual, visualFor } from "@/lib/procIcons";
import { cn } from "@/lib/utils";

type Item = {
	key: string;
	kind: ProcKind | null;
	label: string;
};

type Props = {
	items: Item[];
	max?: number;
	/** Pixel diameter of each chip. Defaults to 16. */
	size?: number;
	/**
	 * Tailwind class for the chip's background + border color. Must match the
	 * surface the icons sit on so the overlap cutout looks seamless. Defaults
	 * to the app background; pass e.g. "bg-card border-card" when the chips
	 * sit on a card-colored surface (like an active tab).
	 */
	chipSurfaceClass?: string;
	className?: string;
};

function StackedIcons({
	items,
	max = 4,
	size = 16,
	chipSurfaceClass = "bg-background border-background",
	className,
}: Props): React.JSX.Element | null {
	// Drop panes we can't meaningfully represent: idle shells get filtered too
	// since "this tab has 3 shell prompts open" adds no signal.
	const renderable = items
		.map((it) => ({ ...it, visual: visualFor(it.kind) }))
		.filter((it): it is Item & { visual: ProcVisual } => it.visual !== null);

	if (renderable.length === 0) return null;

	const shown = renderable.slice(0, max);
	const overflow = renderable.length - shown.length;
	// Half-overlap looks tight at 16px; pull each subsequent chip back by ~45%.
	const overlap = Math.round(size * 0.45);
	const chipStyle: React.CSSProperties = { width: size, height: size };
	const innerIconSize = Math.round(size * 0.75);

	return (
		<div className={cn("flex items-center", className)}>
			{shown.map((it, idx) => {
				const { Icon, fg, fill, label } = it.visual;
				return (
					<Tooltip key={it.key}>
						<TooltipTrigger
							className={cn(
								// border-background gives each chip a same-color cutout so
								// the icon underneath it gets visually clipped where they
								// overlap, even though the border itself is invisible
								// against the tab strip.
								"relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2",
								chipSurfaceClass,
								fg,
							)}
							style={{
								...chipStyle,
								marginLeft: idx === 0 ? 0 : -overlap,
								zIndex: shown.length - idx,
							}}
							aria-label={`${label}${it.label ? `: ${it.label}` : ""}`}
						>
							<Icon size={fill ? size : innerIconSize} />
						</TooltipTrigger>
						<TooltipContent>
							{label}
							{it.label ? ` — ${it.label}` : ""}
						</TooltipContent>
					</Tooltip>
				);
			})}
			{overflow > 0 && (
				<span
					className={cn(
						"flex shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-medium text-muted-foreground",
						chipSurfaceClass,
					)}
					style={{ ...chipStyle, marginLeft: -overlap, zIndex: 0 }}
				>
					+{overflow}
				</span>
			)}
		</div>
	);
}

export default StackedIcons;
