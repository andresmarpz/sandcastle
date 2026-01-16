/** biome-ignore-all lint/a11y/noSvgWithoutTitle: TODO */
import type * as React from "react";

type IconProps = React.ComponentProps<"svg">;

export function ChevronDownIcon(props: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	);
}

export function CopyIcon(props: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</svg>
	);
}

export function CursorIcon(props: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M4 4l8 16 2-6 6-2z" />
			<path d="M12 12l4 4" />
		</svg>
	);
}

export function FinderIcon(props: IconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H3z" />
			<path d="M3 7V5a2 2 0 0 1 2-2h5l2 2h10a2 2 0 0 1 2 2v2" />
		</svg>
	);
}
