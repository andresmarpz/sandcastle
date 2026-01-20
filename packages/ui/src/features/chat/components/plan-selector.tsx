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
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={<Button variant="outline" size="sm" />}
					className="w-auto gap-1.5 px-2"
				>
					<SelectedIcon className={cn("size-3.5", selectedColor)} />
					<span className="text-[13px]">
						{selectedModeData?.label ?? "Plan"}
					</span>
					<IconChevronDown className="size-3 text-muted-foreground" />
				</PopoverTrigger>
				<PopoverContent className="w-48 p-0" align="start">
					<Command>
						<CommandInput placeholder="Search modes..." />
						<CommandList>
							<CommandEmpty>No mode found.</CommandEmpty>
							<CommandGroup>
								{MODES.map((mode) => (
									<CommandItem
										key={mode.value}
										value={mode.value}
										onSelect={handleModeSelect}
										data-checked={selectedMode === mode.value}
									>
										<mode.icon
											className={cn("size-3.5 shrink-0", mode.color)}
										/>
										<span>{mode.label}</span>
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
							<CommandGroup>
								<CommandItem value="create" onSelect={handleModeSelect}>
									<IconPlus className="size-3.5 shrink-0 text-muted-foreground" />
									<span>Create mode</span>
								</CommandItem>
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create Custom Mode</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</>
	);
}
