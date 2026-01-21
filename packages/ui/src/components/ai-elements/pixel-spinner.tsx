"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

export interface PixelSpinnerProps {
	className?: string;
}

/**
 * A 3x3 pixel grid spinner with a chevron wave animation.
 * The chevron moves up (^), bounces at top, then moves down (v).
 *
 * Grid layout:
 * [0,0] [1,0] [2,0]  <- row 0 (top)
 * [0,1] [1,1] [2,1]  <- row 1 (middle)
 * [0,2] [1,2] [2,2]  <- row 2 (bottom)
 */
export const PixelSpinner = memo(function PixelSpinner({
	className,
}: PixelSpinnerProps) {
	// Each pixel gets its own keyframe animation based on position
	// Row 0 = top, Row 2 = bottom
	// distFromCenter: 0 = center column, 1 = side columns

	const pixels = [
		{ row: 0, col: 0, distFromCenter: 1 },
		{ row: 0, col: 1, distFromCenter: 0 },
		{ row: 0, col: 2, distFromCenter: 1 },
		{ row: 1, col: 0, distFromCenter: 1 },
		{ row: 1, col: 1, distFromCenter: 0 },
		{ row: 1, col: 2, distFromCenter: 1 },
		{ row: 2, col: 0, distFromCenter: 1 },
		{ row: 2, col: 1, distFromCenter: 0 },
		{ row: 2, col: 2, distFromCenter: 1 },
	];

	// Generate unique animation name based on position
	const getAnimationName = (row: number, distFromCenter: number) =>
		`wave-r${row}-d${distFromCenter}`;

	// Generate keyframes for each pixel
	// First half (0-50%): chevron going UP (top row peaks first)
	// Second half (50-100%): chevron going DOWN (bottom row peaks first)
	const generateKeyframes = (row: number, distFromCenter: number) => {
		const name = getAnimationName(row, distFromCenter);

		// Timing offsets - tighter spacing for continuous motion
		// For UP: row 0 peaks earliest, row 2 peaks latest
		// For DOWN: row 2 peaks earliest, row 0 peaks latest
		const upOffset = row * 10 + distFromCenter * 4;
		const downOffset = (2 - row) * 10 + distFromCenter * 4;

		// Peak timing - UP phase takes 0-48%, DOWN phase takes 52-100%
		const upPeak = 8 + upOffset; // 8-32%
		const downPeak = 52 + downOffset; // 52-76%

		return `
			@keyframes ${name} {
				0%, 100% { opacity: 0.15; }
				${upPeak - 6}% { opacity: 0.4; }
				${upPeak - 3}% { opacity: 0.65; }
				${upPeak}% { opacity: 0.9; }
				${upPeak + 5}% { opacity: 0.4; }
				${upPeak + 10}% { opacity: 0.15; }
				${downPeak - 6}% { opacity: 0.4; }
				${downPeak - 3}% { opacity: 0.65; }
				${downPeak}% { opacity: 0.9; }
				${downPeak + 5}% { opacity: 0.4; }
			}
		`;
	};

	return (
		<div
			className={cn("grid grid-cols-3 grid-rows-3 gap-px", className)}
			role="status"
			aria-label="Loading"
		>
			{pixels.map(({ row, col, distFromCenter }) => (
				<div
					key={`${row}-${col}`}
					className="size-[5px] bg-blue-500"
					style={{
						animation: `${getAnimationName(row, distFromCenter)} 1.4s ease-in-out infinite`,
					}}
				/>
			))}
			<style>
				{pixels
					.filter(
						(p, i, arr) =>
							arr.findIndex(
								(x) => x.row === p.row && x.distFromCenter === p.distFromCenter,
							) === i,
					)
					.map((p) => generateKeyframes(p.row, p.distFromCenter))
					.join("\n")}
			</style>
		</div>
	);
});
