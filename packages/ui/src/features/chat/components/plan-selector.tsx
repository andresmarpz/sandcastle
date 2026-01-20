"use client";

import {
	IconChevronDown,
	IconHammer,
	IconListCheck,
	IconPlus,
	IconRobot,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/command";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { cn } from "@/lib/utils";

const MODES = [
	{
		value: "plan",
		label: "Plan",
		icon: IconListCheck,
		color: "text-green-500",
	},
	{
		value: "build",
		label: "Build",
		icon: IconHammer,
		color: "text-indigo-500",
	},
	{
		value: "autonomous",
		label: "Autonomous",
		icon: IconRobot,
		color: "text-amber-500",
	},
] as const;

export type Mode = (typeof MODES)[number]["value"];

interface PlanSelectorProps {
	value?: Mode;
	onValueChange?: (value: Mode) => void;
}

export function PlanSelector({ value, onValueChange }: PlanSelectorProps) {
	const [open, setOpen] = useState(false);
	const [internalMode, setInternalMode] = useState<Mode>(value ?? "plan");
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	// Use controlled value if provided, otherwise use internal state
	const selectedMode = value ?? internalMode;

	const handleModeSelect = (newValue: string) => {
		if (newValue === "create") {
			setCreateDialogOpen(true);
			setOpen(false);
			return;
		}
		const mode = newValue as Mode;
		// Update internal state for uncontrolled mode
		setInternalMode(mode);
		// Notify parent
		onValueChange?.(mode);
		setOpen(false);
	};

	const selectedModeData = MODES.find((m) => m.value === selectedMode);
	const SelectedIcon = selectedModeData?.icon ?? IconListCheck;
	const selectedColor = selectedModeData?.color ?? "text-green-500";

	return (
						{selectedMode === mode.value && <IconCheck className="size-3" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
