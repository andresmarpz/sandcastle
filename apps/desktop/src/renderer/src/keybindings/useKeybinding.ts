import {
	type HotkeyCallback,
	useHotkey,
	type UseHotkeyOptions,
} from "@tanstack/react-hotkeys";

import { KEYBINDINGS, type KeybindingId } from "./registry";

/**
 * Register a handler for a keybinding declared in the central registry.
 *
 * Every keybinding in the app must have a registry entry — the registry is
 * the single source of truth for hotkey strings and what each does. Handlers
 * stay local to the component that knows how to act on them.
 */
export const useKeybinding = (
	id: KeybindingId,
	callback: HotkeyCallback,
	options?: UseHotkeyOptions,
): void => {
	const def = KEYBINDINGS[id];
	useHotkey(def.hotkey, callback, {
		...options,
		meta: {
			name: def.name,
			description: def.description,
			...options?.meta,
		},
	});
};
