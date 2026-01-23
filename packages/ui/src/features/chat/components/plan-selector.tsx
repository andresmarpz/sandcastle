"use client";

import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { HammerIcon } from "@phosphor-icons/react/Hammer";
import { ListChecksIcon } from "@phosphor-icons/react/ListChecks";
import { useState } from "react";
import { Button } from "@/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

const MODES = [
	{
		value: "plan",
		label: "Plan",
		icon: ListChecksIcon,
		color: "text-green-500",
	},
	{
		value: "build",
		label: "Build",
		icon: HammerIcon,
		color: "text-indigo-500",
	},
] as const;

export type Mode = (typeof MODES)[number]["value"];

interface PlanSelectorProps {
	value?: Mode;
	onValueChange?: (value: Mode) => void;
	disabled?: boolean;
}

export function PlanSelector({
	value,
	onValueChange,
	disabled = false,
}: PlanSelectorProps) {
	const [internalMode, setInternalMode] = useState<Mode>(value ?? "plan");

	// Use controlled value if provided, otherwise use internal state
	const selectedMode = value ?? internalMode;

	const handleModeSelect = (newValue: string) => {
		const mode = newValue as Mode;
		// Update internal state for uncontrolled mode
		setInternalMode(mode);
		// Notify parent
		onValueChange?.(mode);
	};

	const selectedModeData = MODES.find((m) => m.value === selectedMode);
	const SelectedIcon = selectedModeData?.icon ?? ListChecksIcon;
	const selectedColor = selectedModeData?.color ?? "text-green-500";

	// When disabled, show the current mode but prevent interaction
	if (disabled) {
		return (
			<Button
				variant="outline"
				size="sm"
				disabled
				className="w-auto gap-1.5 px-2 opacity-60"
			>
				<SelectedIcon className={cn("size-3.5", selectedColor)} />
				<span className="hidden text-[13px] sm:inline">
					{selectedModeData?.label ?? "Plan"}
				</span>
				<CaretDownIcon className="hidden size-3 text-muted-foreground sm:inline" />
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="ghost" size="sm" />}
				className="w-auto gap-1.5 px-2"
			>
				<span className="hidden text-[13px] sm:inline">
					{selectedModeData?.label ?? "Plan"}
				</span>
				<CaretDownIcon className="hidden size-3 text-muted-foreground sm:inline" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				{MODES.map((mode) => (
					<DropdownMenuItem
						key={mode.value}
						onClick={() => handleModeSelect(mode.value)}
						className="flex items-center justify-between"
					>
						<span className="flex items-center gap-2">
							<mode.icon className={cn("size-3.5 shrink-0", mode.color)} />
							<span>{mode.label}</span>
						</span>

						{selectedMode === mode.value && <CheckIcon className="size-3" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
