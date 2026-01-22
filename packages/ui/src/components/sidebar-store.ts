import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createStore } from "zustand/vanilla";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar_width";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_MIN_WIDTH = 370;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 370;

export interface SidebarState {
	open: boolean;
	openMobile: boolean;
	width: number;
	isResizing: boolean;
}

export interface SidebarActions {
	setOpen: (open: boolean) => void;
	setOpenMobile: (open: boolean) => void;
	setWidth: (width: number) => void;
	setIsResizing: (isResizing: boolean) => void;
	toggleSidebar: (isMobile: boolean) => void;
}

export type SidebarStore = SidebarState & SidebarActions;

function getInitialWidth(): number {
	if (typeof document !== "undefined") {
		const match = document.cookie.match(
			new RegExp(`${SIDEBAR_WIDTH_COOKIE_NAME}=([^;]+)`),
		);
		if (match?.length && match[1]) {
			const parsed = Number.parseInt(match[1], 10);
			if (
				!Number.isNaN(parsed) &&
				parsed >= SIDEBAR_MIN_WIDTH &&
				parsed <= SIDEBAR_MAX_WIDTH
			) {
				return parsed;
			}
		}
	}
	return SIDEBAR_DEFAULT_WIDTH;
}

function getInitialOpen(): boolean {
	if (typeof document !== "undefined") {
		const match = document.cookie.match(
			new RegExp(`${SIDEBAR_COOKIE_NAME}=([^;]+)`),
		);
		if (match?.length && match[1]) {
			return match[1] === "true";
		}
	}
	return true;
}

export const sidebarStore = createStore<SidebarStore>((set) => ({
	// State
	open: getInitialOpen(),
	openMobile: false,
	width: getInitialWidth(),
	isResizing: false,

	// Actions
	setOpen: (open: boolean) => {
		document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
		set({ open });
	},

	setOpenMobile: (openMobile: boolean) => {
		set({ openMobile });
	},

	setWidth: (width: number) => {
		const clampedWidth = Math.min(
			Math.max(width, SIDEBAR_MIN_WIDTH),
			SIDEBAR_MAX_WIDTH,
		);
		document.cookie = `${SIDEBAR_WIDTH_COOKIE_NAME}=${clampedWidth}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
		set({ width: clampedWidth });
	},

	setIsResizing: (isResizing: boolean) => {
		set({ isResizing });
	},

	toggleSidebar: (isMobile: boolean) => {
		if (isMobile) {
			set((state) => ({ openMobile: !state.openMobile }));
		} else {
			set((state) => {
				const newOpen = !state.open;
				document.cookie = `${SIDEBAR_COOKIE_NAME}=${newOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
				return { open: newOpen };
			});
		}
	},
}));

// Selectors - use these to subscribe to specific slices
export function useSidebarOpen() {
	return useStore(sidebarStore, (state) => state.open);
}

export function useSidebarOpenMobile() {
	return useStore(sidebarStore, (state) => state.openMobile);
}

export function useSidebarWidth() {
	return useStore(sidebarStore, (state) => state.width);
}

export function useSidebarIsResizing() {
	return useStore(sidebarStore, (state) => state.isResizing);
}

export function useSidebarState() {
	return useStore(sidebarStore, (state) =>
		state.open ? "expanded" : "collapsed",
	);
}

// Actions - useShallow prevents re-renders when returning an object
export function useSidebarActions() {
	return useStore(
		sidebarStore,
		useShallow((state) => ({
			setOpen: state.setOpen,
			setOpenMobile: state.setOpenMobile,
			setWidth: state.setWidth,
			setIsResizing: state.setIsResizing,
			toggleSidebar: state.toggleSidebar,
		})),
	);
}

// Export constants for use in components
export { SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_DEFAULT_WIDTH };
export const SIDEBAR_WIDTH_ICON = "4rem";
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";
export const SIDEBAR_COLLAPSE_THRESHOLD = 320;
