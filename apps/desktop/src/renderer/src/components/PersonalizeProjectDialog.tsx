import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	AVATAR_COLOR_KEYS,
	AVATAR_COLOR_LABELS,
	type AvatarColorKey,
	firstGrapheme,
} from "@/lib/avatarColors";
import { cn } from "@/lib/utils";

type Props = {
	projectName: string;
	currentColor: AvatarColorKey | undefined;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (color: AvatarColorKey) => void;
};

function avatarStyle(color: AvatarColorKey): React.CSSProperties {
	return {
		background: `var(--avatar-background-${color})`,
		color: `var(--avatar-text-${color})`,
	};
}

// Soft top-down sheen, matching the project avatar in the sidebar.
const SHEEN =
	"before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0))]";

function PersonalizeProjectDialog({
	projectName,
	currentColor,
	open,
	onOpenChange,
	onSave,
}: Props): React.JSX.Element {
	const [selected, setSelected] = useState<AvatarColorKey>(currentColor ?? AVATAR_COLOR_KEYS[0]);
	// Unique radio-group name so multiple mounted dialogs never share a group.
	const groupName = useId();

	const letter = (firstGrapheme(projectName) || "?").toUpperCase();

	// Re-seed the picker with the project's current color every time it opens, so
	// the dialog always starts from the truth even if the color changed elsewhere.
	useEffect(() => {
		if (open) setSelected(currentColor ?? AVATAR_COLOR_KEYS[0]);
	}, [open, currentColor]);

	const handleSave = (): void => {
		onSave(selected);
		onOpenChange(false);
	};

	const changed = selected !== currentColor;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Personalize project</DialogTitle>
					<DialogDescription>Choose the icon color for {projectName}.</DialogDescription>
				</DialogHeader>

				<div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
					<div
						aria-hidden
						style={avatarStyle(selected)}
						className={cn(
							"relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-md",
							"border-[0.5px] border-border text-sm font-medium uppercase",
							SHEEN,
						)}
					>
						<span className="relative">{letter}</span>
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">{projectName}</p>
						<p className="text-xs text-muted-foreground">{AVATAR_COLOR_LABELS[selected]}</p>
					</div>
				</div>

				{/* Keys are wheel-ordered (warm → cool), so a 5-wide grid reads as two
				    balanced rainbow rows regardless of the dialog width. */}
				<fieldset className="grid grid-cols-5 gap-2">
					<legend className="sr-only">Icon color</legend>
					{AVATAR_COLOR_KEYS.map((key) => {
						const isSelected = key === selected;
						return (
							<label
								key={key}
								title={AVATAR_COLOR_LABELS[key]}
								style={avatarStyle(key)}
								className={cn(
									"relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-lg text-base font-medium uppercase",
									"border-[0.5px] border-border transition-transform duration-100",
									SHEEN,
									"hover:-translate-y-0.5",
									"has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
									isSelected &&
										"ring-2 ring-ring ring-offset-2 ring-offset-popover hover:translate-y-0",
								)}
							>
								<input
									type="radio"
									name={groupName}
									value={key}
									checked={isSelected}
									onChange={() => setSelected(key)}
									className="sr-only"
								/>
								<span className="relative">{letter}</span>
								<span className="sr-only">{AVATAR_COLOR_LABELS[key]}</span>
							</label>
						);
					})}
				</fieldset>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
					<Button size="sm" onClick={handleSave} disabled={!changed}>
						Save color
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default PersonalizeProjectDialog;
