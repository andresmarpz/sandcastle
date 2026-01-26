"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CheckFatIcon } from "@phosphor-icons/react/CheckFat";
import { HourglassIcon } from "@phosphor-icons/react/Hourglass";
import { ListChecksIcon } from "@phosphor-icons/react/ListChecks";
import { MinusIcon } from "@phosphor-icons/react/Minus";
import { ProhibitIcon } from "@phosphor-icons/react/Prohibit";
import { SpinnerIcon } from "@phosphor-icons/react/Spinner";
import { XIcon } from "@phosphor-icons/react/X";

type Status =
	| "streaming"
	| "pending"
	| "approved"
	| "changes-requested"
	| "denied";

const statuses: Status[] = [
	"streaming",
	"pending",
	"approved",
	"changes-requested",
	"denied",
];

export function StatusPlayground() {
	return (
		<div className="p-8 space-y-12 max-w-5xl">
			<h1 className="text-2xl font-bold">Status Badge Playground</h1>

			{/* Main variant */}
			<Section title="Current (Option C with tighter spacing)">
				<div className="flex flex-wrap gap-4">
					{statuses.map((status) => (
						<VariantC key={status} status={status} />
					))}
				</div>
			</Section>

			{/* Icon alternatives for Approved */}
			<Section title="Approved icon options">
				<div className="flex flex-wrap gap-4">
					<IconBadge
						icon={<CheckFatIcon className="size-3" />}
						label="CheckFat"
						color="emerald"
					/>
					<IconBadge
						icon={<CheckIcon className="size-3" weight="bold" />}
						label="Check bold"
						color="emerald"
					/>
					<IconBadge
						icon={<CheckIcon className="size-3" />}
						label="Check regular"
						color="emerald"
					/>
				</div>
			</Section>

			{/* Icon alternatives for Denied */}
			<Section title="Denied icon options">
				<div className="flex flex-wrap gap-4">
					<IconBadge
						icon={<XIcon className="size-3" weight="bold" />}
						label="X bold"
						color="red"
					/>
					<IconBadge
						icon={<XIcon className="size-3" />}
						label="X regular"
						color="red"
					/>
					<IconBadge
						icon={<ProhibitIcon className="size-3" />}
						label="Prohibit"
						color="red"
					/>
					<IconBadge
						icon={<MinusIcon className="size-3" weight="bold" />}
						label="Minus"
						color="red"
					/>
				</div>
			</Section>

			{/* In context - light */}
			<Section title="In Context (Light bg)">
				<div className="bg-white border border-border rounded-lg p-4 space-y-3">
					{statuses.map((status) => (
						<TriggerPreview key={status} status={status} />
					))}
				</div>
			</Section>

			{/* In context - dark */}
			<Section title="In Context (Dark bg)">
				<div className="bg-zinc-900 rounded-lg p-4 space-y-3">
					{statuses.map((status) => (
						<TriggerPreview key={status} status={status} />
					))}
				</div>
			</Section>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-4">
			<h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
			{children}
		</div>
	);
}

// Helper to show icon options in a badge
function IconBadge({
	icon,
	label,
	color,
}: {
	icon: React.ReactNode;
	label: string;
	color: "amber" | "emerald" | "red" | "violet";
}) {
	const colors = {
		amber:
			"bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
		emerald:
			"bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
		red: "bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300",
		violet:
			"bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
	};
	return (
		<div className="flex flex-col items-center gap-2">
			<span className={`${badgeBase} ${colors[color]}`}>
				{icon}
				{label}
			</span>
			<span className="text-[10px] text-muted-foreground">{label}</span>
		</div>
	);
}

// Base badge styles
const badgeBase =
	"inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium";

// Main variant (Option C with new icons)
function VariantC({ status }: { status: Status }) {
	switch (status) {
		case "streaming":
			return (
				<span
					className={`${badgeBase} bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300`}
				>
					<SpinnerIcon className="size-3 animate-spin" />
					Planning...
				</span>
			);
		case "pending":
			return (
				<span
					className={`${badgeBase} bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300`}
				>
					<HourglassIcon className="size-3" />
					Pending
				</span>
			);
		case "approved":
			return (
				<span
					className={`${badgeBase} bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300`}
				>
					<CheckIcon className="size-3" />
					Approved
				</span>
			);
		case "changes-requested":
			return (
				<span
					className={`${badgeBase} bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300`}
				>
					<ArrowCounterClockwiseIcon className="size-3" />
					Changes Requested
				</span>
			);
		case "denied":
			return (
				<span
					className={`${badgeBase} bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300`}
				>
					<XIcon className="size-3" />
					Denied
				</span>
			);
	}
}

// Trigger preview
function TriggerPreview({ status }: { status: Status }) {
	return (
		<div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
			<div className="flex items-center gap-3 px-4 py-3 text-sm">
				<ListChecksIcon className="size-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
				<span className="font-medium text-zinc-900 dark:text-zinc-100">
					Implementation Plan
				</span>
				<div className="ml-auto flex items-center gap-3">
					<VariantC status={status} />
					<CaretDownIcon className="size-4 text-zinc-400 dark:text-zinc-500" />
				</div>
			</div>
		</div>
	);
}
