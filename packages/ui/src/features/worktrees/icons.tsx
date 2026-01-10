interface IconProps {
	className?: string;
}

export function FinderIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<rect x="2" y="3" width="12" height="10" rx="1" />
		</svg>
	);
}

export function CursorIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d="M3 2l10 6-4 1-1 4z" />
		</svg>
	);
}

export function CopyIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<rect x="4" y="4" width="8" height="10" rx="1" />
			<rect
				x="2"
				y="2"
				width="8"
				height="10"
				rx="1"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
			/>
		</svg>
	);
}

export function ChevronDownIcon({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path
				d="M4 6l4 4 4-4"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}
