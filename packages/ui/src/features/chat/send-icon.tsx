interface SendIconProps {
	className?: string;
}

export function SendIcon({ className }: SendIconProps) {
	return (
		<svg className={className} viewBox="0 0 16 16" fill="currentColor">
			<path d="M1 8l6-6v4h8v4H7v4z" />
		</svg>
	);
}
