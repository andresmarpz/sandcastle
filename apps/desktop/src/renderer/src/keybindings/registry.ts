import type { Hotkey } from "@tanstack/react-hotkeys";

export type KeybindingGroup = "tabs" | "panes";

export type KeybindingId =
	| "tab.switch.1"
	| "tab.switch.2"
	| "tab.switch.3"
	| "tab.switch.4"
	| "tab.switch.5"
	| "tab.switch.6"
	| "tab.switch.7"
	| "tab.switch.8"
	| "tab.switch.9"
	| "pane.nav.up"
	| "pane.nav.down"
	| "pane.nav.left"
	| "pane.nav.right"
	| "pane.resize.up"
	| "pane.resize.down"
	| "pane.resize.left"
	| "pane.resize.right";

export type KeybindingDef = {
	id: KeybindingId;
	hotkey: Hotkey;
	name: string;
	description: string;
	group: KeybindingGroup;
};

const tabSwitch = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): KeybindingDef => ({
	id: `tab.switch.${n}` as KeybindingId,
	hotkey: `Mod+${n}` as Hotkey,
	name: `Switch to tab ${n}`,
	description: `Activate the ${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} tab in the workspace`,
	group: "tabs",
});

export const KEYBINDINGS = {
	"tab.switch.1": tabSwitch(1),
	"tab.switch.2": tabSwitch(2),
	"tab.switch.3": tabSwitch(3),
	"tab.switch.4": tabSwitch(4),
	"tab.switch.5": tabSwitch(5),
	"tab.switch.6": tabSwitch(6),
	"tab.switch.7": tabSwitch(7),
	"tab.switch.8": tabSwitch(8),
	"tab.switch.9": tabSwitch(9),

	"pane.nav.up": {
		id: "pane.nav.up",
		hotkey: "Mod+ArrowUp",
		name: "Focus pane above",
		description: "Move focus to the pane directly above the active pane",
		group: "panes",
	},
	"pane.nav.down": {
		id: "pane.nav.down",
		hotkey: "Mod+ArrowDown",
		name: "Focus pane below",
		description: "Move focus to the pane directly below the active pane",
		group: "panes",
	},
	"pane.nav.left": {
		id: "pane.nav.left",
		hotkey: "Mod+ArrowLeft",
		name: "Focus pane to the left",
		description: "Move focus to the pane directly to the left of the active pane",
		group: "panes",
	},
	"pane.nav.right": {
		id: "pane.nav.right",
		hotkey: "Mod+ArrowRight",
		name: "Focus pane to the right",
		description: "Move focus to the pane directly to the right of the active pane",
		group: "panes",
	},

	"pane.resize.up": {
		id: "pane.resize.up",
		hotkey: "Mod+Shift+ArrowUp",
		name: "Resize pane up",
		description: "Move the active pane's bottom edge upward (shrink vertically)",
		group: "panes",
	},
	"pane.resize.down": {
		id: "pane.resize.down",
		hotkey: "Mod+Shift+ArrowDown",
		name: "Resize pane down",
		description: "Move the active pane's bottom edge downward (grow vertically)",
		group: "panes",
	},
	"pane.resize.left": {
		id: "pane.resize.left",
		hotkey: "Mod+Shift+ArrowLeft",
		name: "Resize pane left",
		description: "Move the active pane's right edge leftward (shrink horizontally)",
		group: "panes",
	},
	"pane.resize.right": {
		id: "pane.resize.right",
		hotkey: "Mod+Shift+ArrowRight",
		name: "Resize pane right",
		description: "Move the active pane's right edge rightward (grow horizontally)",
		group: "panes",
	},
} as const satisfies Record<KeybindingId, KeybindingDef>;

export const listKeybindings = (): KeybindingDef[] => Object.values(KEYBINDINGS);

export const listKeybindingsByGroup = (group: KeybindingGroup): KeybindingDef[] =>
	listKeybindings().filter((kb) => kb.group === group);
