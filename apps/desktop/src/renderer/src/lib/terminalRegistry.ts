import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITheme, Terminal as XTerm } from "@xterm/xterm";

import { DECAY_MS, scanWorking } from "@/lib/activityDetector";

type CreateOptions = {
	cwd?: string;
	shell?: string;
	workspaceId?: string;
};

export type RendererType = "webgl" | "canvas" | "dom";

type Instance = {
	leafId: string;
	sessionId: string;
	xterm: XTerm;
	fit: FitAddon;
	search: SearchAddon;
	webgl: WebglAddon | null;
	rendererType: RendererType;
	currentContainer: HTMLElement | null;
	resizeObserver: ResizeObserver;
	ptyResizeTimer: ReturnType<typeof setTimeout> | null;
	ipcUnsubs: Array<() => void>;
	disposed: boolean;
	lastSentCols: number;
	lastSentRows: number;
	// Set when this pane is teleported into another workspace (e.g. a Claude
	// session enters a git worktree). The shell PTY's own cwd does NOT follow
	// Claude into the worktree — only Claude (a child process) cd's — so
	// getProcessCwd(pty.pid) keeps reporting the stale origin dir. We remember
	// the teleport destination here and spawn splits / new tabs from THIS pane
	// there instead. null until a teleport happens.
	teleportedCwd: string | null;
	// Byte-path Claude activity detection (see activityDetector + stores/activity).
	activityTail: string;
	lastWorkingAt: number;
	byteWorking: boolean;
};

const FONT_FAMILY =
	'"IBM Plex Mono", "Symbols Nerd Font Mono", "Symbols Nerd Font", "JetBrainsMono Nerd Font", "MesloLGS NF", "Menlo", "Monaco", monospace';

export type TerminalThemeMode = "light" | "dark";

type ThemePalette = Omit<ITheme, "background" | "cursorAccent">;

const DARK_PALETTE: ThemePalette = {
	foreground: "#e6e6e6",
	cursor: "#e6e6e6",
	selectionBackground: "#3a3a3a",
	black: "#1a1a1a",
	red: "#f97583",
	green: "#85e89d",
	yellow: "#ffea7f",
	blue: "#79b8ff",
	magenta: "#b392f0",
	cyan: "#9ecbff",
	white: "#d1d5da",
	brightBlack: "#6a737d",
	brightRed: "#ffa7b4",
	brightGreen: "#a6f0b4",
	brightYellow: "#fff2a0",
	brightBlue: "#a8d3ff",
	brightMagenta: "#cbb4ff",
	brightCyan: "#c4dcff",
	brightWhite: "#fafbfc",
};

const LIGHT_PALETTE: ThemePalette = {
	foreground: "#1a1a1a",
	cursor: "#1a1a1a",
	selectionBackground: "#c8d4e3",
	black: "#24292e",
	red: "#d73a49",
	green: "#22863a",
	yellow: "#b08800",
	blue: "#0366d6",
	magenta: "#6f42c1",
	cyan: "#1b7c83",
	white: "#6a737d",
	brightBlack: "#959da5",
	brightRed: "#cb2431",
	brightGreen: "#28a745",
	brightYellow: "#dbab09",
	brightBlue: "#0366d6",
	brightMagenta: "#5a32a3",
	brightCyan: "#3192aa",
	brightWhite: "#d1d5da",
};

// xterm needs concrete colors, so resolve the sidebar token off the document.
// Light/dark are toggled via the `.dark` class on <html>, so getPropertyValue
// reads whichever value is currently active.
const readSidebarBg = (fallback: string): string => {
	if (typeof document === "undefined") return fallback;
	const value = getComputedStyle(document.documentElement).getPropertyValue("--sidebar").trim();
	return value || fallback;
};

const buildTheme = (mode: TerminalThemeMode): ITheme => {
	const fallback = mode === "light" ? "#ffffff" : "#161616";
	const bg = readSidebarBg(fallback);
	const palette = mode === "light" ? LIGHT_PALETTE : DARK_PALETTE;
	return { ...palette, background: bg, cursorAccent: bg };
};

let currentTheme: ITheme = buildTheme("dark");

const instances = new Map<string, Instance>();

// --- Claude activity (byte path) ---------------------------------------------
// This registry is the single chokepoint where every PTY's output is observed,
// so the cheap "working" spinner scan lives here and is pushed to the activity
// store through this channel. Authoritative status (working/needs-attention/
// done) comes from Claude Code hooks in main; this is the zero-setup fallback
// that only ever asserts "working".

export type ActivityEvent =
	| { kind: "byte-working"; leafId: string; working: boolean }
	| { kind: "focus"; leafId: string }
	| { kind: "dispose"; leafId: string };

const activityListeners = new Set<(event: ActivityEvent) => void>();

const notifyActivity = (event: ActivityEvent): void => {
	for (const fn of activityListeners) fn(event);
};

export const subscribeActivity = (fn: (event: ActivityEvent) => void): (() => void) => {
	activityListeners.add(fn);
	return () => {
		activityListeners.delete(fn);
	};
};

// Resolve the leaf that owns a PTY session, so hook events (which carry the
// sessionId injected into the PTY env) can be routed to the right pane.
export const getLeafIdForSession = (sessionId: string): string | null => {
	for (const inst of instances.values()) {
		if (inst.sessionId === sessionId) return inst.leafId;
	}
	return null;
};

let decayTimer: ReturnType<typeof setInterval> | null = null;

// onData fires only while output flows, so it can raise "working" but never
// lower it. This shared 1s sweep emits the falling edge once the spinner has
// been quiet past DECAY_MS, and tears itself down when no terminals remain.
const ensureDecayTimer = (): void => {
	if (decayTimer) return;
	decayTimer = setInterval(() => {
		const now = Date.now();
		for (const inst of instances.values()) {
			if (inst.byteWorking && now - inst.lastWorkingAt >= DECAY_MS) {
				inst.byteWorking = false;
				notifyActivity({ kind: "byte-working", leafId: inst.leafId, working: false });
			}
		}
		if (instances.size === 0 && decayTimer) {
			clearInterval(decayTimer);
			decayTimer = null;
		}
	}, 1000);
};

// Feed a chunk of PTY output to the byte-path detector. Emits only on the
// rising edge into "working"; ensureDecayTimer emits the falling edge.
const ingestOutput = (inst: Instance, data: string): void => {
	const { tail, working } = scanWorking(inst.activityTail, data);
	inst.activityTail = tail;
	if (working) inst.lastWorkingAt = Date.now();
	if (working && !inst.byteWorking) {
		inst.byteWorking = true;
		notifyActivity({ kind: "byte-working", leafId: inst.leafId, working: true });
	}
};

const applyCurrentTheme = (mode: TerminalThemeMode): void => {
	currentTheme = buildTheme(mode);
	for (const inst of instances.values()) {
		inst.xterm.options.theme = currentTheme;
		// xterm.refresh() repaints cells but reuses the WebGL texture atlas,
		// which is keyed on (glyph, fg, bg) and still holds the old palette.
		// That mismatch is one of the ways atlas slots end up with stale
		// pixels and show as garbled glyphs. Tear the WebGL addon down and
		// re-add it so the atlas is rebuilt from scratch under the new theme.
		if (inst.rendererType === "webgl" && inst.webgl) {
			try {
				inst.webgl.dispose();
			} catch {
				// already disposed
			}
			inst.webgl = null;
			try {
				const next = new WebglAddon();
				next.onContextLoss(() => {
					try {
						next.dispose();
					} catch {}
					inst.webgl = null;
					try {
						inst.xterm.loadAddon(new CanvasAddon());
						inst.rendererType = "canvas";
					} catch {}
				});
				inst.xterm.loadAddon(next);
				inst.webgl = next;
			} catch {
				// WebGL gone — fall back to canvas
				try {
					inst.xterm.loadAddon(new CanvasAddon());
					inst.rendererType = "canvas";
				} catch {}
			}
		} else {
			try {
				inst.xterm.refresh(0, Math.max(0, inst.xterm.rows - 1));
			} catch {
				// terminal not yet measured
			}
		}
	}
};

export const setTerminalTheme = (mode: TerminalThemeMode): void => {
	// next-themes toggles the `.dark` class on <html> in an effect during the
	// same commit our caller fires in. Reading --sidebar synchronously races
	// that toggle (we see the previous mode's value). Defer to a rAF so the
	// class change has landed and getComputedStyle returns the new color.
	if (typeof requestAnimationFrame === "undefined") {
		applyCurrentTheme(mode);
		return;
	}
	requestAnimationFrame(() => applyCurrentTheme(mode));
};

const createXterm = (): { xterm: XTerm; fit: FitAddon; search: SearchAddon } => {
	const xterm = new XTerm({
		fontFamily: FONT_FAMILY,
		fontSize: 14,
		fontWeight: 400,
		fontWeightBold: 700,
		lineHeight: 1,
		letterSpacing: 0,
		cursorBlink: false,
		allowProposedApi: true,
		customGlyphs: true,
		scrollback: 10000,
		scrollSensitivity: 3,
		fastScrollSensitivity: 6,
		macOptionIsMeta: true,
		rightClickSelectsWord: true,
		theme: currentTheme,
	});
	const fit = new FitAddon();
	const search = new SearchAddon();
	xterm.loadAddon(fit);
	xterm.loadAddon(search);
	xterm.loadAddon(new WebLinksAddon());
	return { xterm, fit, search };
};

const safeFit = (inst: Instance): void => {
	if (!inst.currentContainer) return;
	try {
		inst.fit.fit();
	} catch {
		// container not yet sized
	}
};

// Debounce fit so it does NOT run during continuous drag: each xterm.resize()
// resizes the WebGL canvas which clears its framebuffer, and a clear-and-redraw
// every frame looks like flicker. By only firing after the user pauses or
// releases, the canvas just gets CSS-stretched during the drag (mildly blurry)
// and snaps crisp once they stop. This is the VS Code approach.
const RESIZE_DEBOUNCE_MS = 75;

const scheduleResize = (inst: Instance): void => {
	if (inst.ptyResizeTimer) clearTimeout(inst.ptyResizeTimer);
	inst.ptyResizeTimer = setTimeout(() => {
		inst.ptyResizeTimer = null;
		if (inst.disposed) return;
		safeFit(inst);
		const { cols, rows } = inst.xterm;
		// During pane-tree restructures the slot can momentarily be ~0px; a 1×1
		// SIGWINCH makes most TUIs (Claude Code, fzf, less, htop) bail out, so
		// drop obviously-bogus dims and let the next observer tick send real ones.
		if (cols < 2 || rows < 2) return;
		if (cols === inst.lastSentCols && rows === inst.lastSentRows) return;
		inst.lastSentCols = cols;
		inst.lastSentRows = rows;
		window.api.terminal.resize(inst.sessionId, cols, rows);
	}, RESIZE_DEBOUNCE_MS);
};

const createInstance = (leafId: string, container: HTMLElement, opts: CreateOptions): Instance => {
	const { xterm, fit, search } = createXterm();
	// Durable per-leaf id (no Date.now()): the socket key derived from leafId in
	// main must be stable across restarts so a relaunched pane reattaches to its
	// still-alive abduco server. terminal:create early-returns on a known id, so
	// reusing the id across soft reloads is safe. See docs/pty-persistence.md §3.
	const sessionId = `term-${leafId}`;

	xterm.open(container);
	let rendererType: RendererType = "dom";
	let webgl: WebglAddon | null = null;
	// WebGL is far smoother on resize and on large output bursts than the
	// Canvas renderer (no clear-and-redraw flash, GPU-cached glyph atlas).
	// If the GL context is ever lost (driver reset, tab thrown away by the
	// GPU process), the addon's onContextLoss fires once — recover by
	// disposing the WebGL addon and falling back to Canvas, which is good
	// enough and won't keep crashing.
	try {
		// preserveDrawingBuffer leaves stale pixels in the GL framebuffer between
		// frames, which makes WebGL atlas-eviction artifacts visible as garbled
		// glyphs during heavy TUI repaints (e.g. Claude Code). Default-cleared
		// swaps avoid that at the cost of a barely-perceptible flash on resize.
		const addon = new WebglAddon();
		addon.onContextLoss(() => {
			try {
				addon.dispose();
			} catch {}
			inst.webgl = null;
			try {
				xterm.loadAddon(new CanvasAddon());
				inst.rendererType = "canvas";
			} catch {
				// DOM renderer remains as last resort
				inst.rendererType = "dom";
			}
		});
		xterm.loadAddon(addon);
		webgl = addon;
		rendererType = "webgl";
	} catch {
		try {
			xterm.loadAddon(new CanvasAddon());
			rendererType = "canvas";
		} catch {
			// fall back to DOM renderer
		}
	}

	// Fit before spawning so the pty starts at the real container size. If we
	// spawn at the default 80×24 and resize on the next frame, zsh's first
	// prompt is queued at the old width — its PROMPT_SP partial-line marker
	// (`%` + spaces + CR + ED) then doesn't fill the real terminal width, so
	// the `%` line survives instead of being overwritten by the prompt.
	try {
		fit.fit();
	} catch {
		// container not yet sized — rAF below will retry
	}

	// macOS line-editing shortcuts that xterm.js doesn't bind by default.
	// We intercept before xterm processes the key, then write the equivalent
	// readline/ZLE control byte into the PTY ourselves.
	xterm.attachCustomKeyEventHandler((e) => {
		if (e.type !== "keydown") return true;
		// Option+1..9 are global app shortcuts (switch project). With
		// macOptionIsMeta, xterm would otherwise swallow them as a meta-escape
		// written to the PTY. Returning false makes xterm ignore the event
		// WITHOUT calling preventDefault, so it bubbles to the document-level
		// hotkey handler — the same path that works when the terminal isn't
		// focused. Match on `code` because Option+digit mangles `key` on macOS.
		if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
			return false;
		}
		const sendSeq = (seq: string): boolean => {
			e.preventDefault();
			if (!inst.disposed) window.api.terminal.write(sessionId, seq);
			return false;
		};
		if (e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
			return sendSeq("\x1b\r");
		}
		if (!e.metaKey) return true;
		switch (e.key) {
			case "Backspace":
				return sendSeq("\x15"); // Ctrl-U → kill to start of line
			case "Delete":
				return sendSeq("\x0b"); // Ctrl-K → kill to end of line
			case "ArrowLeft":
				return sendSeq("\x01"); // Ctrl-A → start of line
			case "ArrowRight":
				return sendSeq("\x05"); // Ctrl-E → end of line
			case "k":
			case "K":
				// Clear scrollback + visible buffer (xterm-side, doesn't disturb shell)
				e.preventDefault();
				xterm.clear();
				return false;
			default:
				return true;
		}
	});

	const inst: Instance = {
		leafId,
		sessionId,
		xterm,
		fit,
		search,
		webgl,
		rendererType,
		currentContainer: container,
		resizeObserver: new ResizeObserver(() => scheduleResize(inst)),
		ptyResizeTimer: null,
		ipcUnsubs: [],
		disposed: false,
		lastSentCols: xterm.cols,
		lastSentRows: xterm.rows,
		teleportedCwd: null,
		activityTail: "",
		lastWorkingAt: 0,
		byteWorking: false,
	};

	requestAnimationFrame(() => safeFit(inst));

	inst.ipcUnsubs.push(
		window.api.terminal.onData(sessionId, (data) => {
			xterm.write(data);
			ingestOutput(inst, data);
		}),
	);
	inst.ipcUnsubs.push(
		window.api.terminal.onExit(sessionId, ({ exitCode }) => {
			xterm.writeln(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m`);
		}),
	);

	const inputSub = xterm.onData((data) => {
		if (!inst.disposed) window.api.terminal.write(sessionId, data);
	});
	inst.ipcUnsubs.push(() => inputSub.dispose());

	void window.api.terminal
		.create({
			id: sessionId,
			leafId,
			cols: xterm.cols,
			rows: xterm.rows,
			cwd: opts.cwd,
			shell: opts.shell,
			workspaceId: opts.workspaceId,
		})
		.then(() => {
			// Repaint on (re)attach. abduco does NOT replay the screen (unlike tmux),
			// so a reattached TUI (claude, htop, lazygit) stays blank until the program
			// redraws — which it does on SIGWINCH. The catch: the reattached xterm fits
			// the same container, so it's the SAME size the server's pty already has,
			// and resizing a pty to its current size is a kernel no-op (no SIGWINCH
			// fires) — which is why a plain reconcile left the pane blank until the user
			// forced a redraw by hand. Force a REAL winsize delta instead: shrink the
			// pty by one row, then restore it a tick later. Two genuine SIGWINCHes make
			// the foreground program re-lay-out and fully repaint. We resize only the
			// PTY (not xterm), so there's no canvas churn; harmless on a fresh shell.
			if (inst.disposed) return;
			// Small delay so the abduco client has connected and forwarded the initial
			// winsize before we jiggle it.
			setTimeout(() => {
				if (inst.disposed || !inst.currentContainer) return;
				safeFit(inst);
				const { cols, rows } = inst.xterm;
				if (cols < 2 || rows < 2) return;
				window.api.terminal.resize(inst.sessionId, cols, rows - 1);
				setTimeout(() => {
					if (inst.disposed) return;
					window.api.terminal.resize(inst.sessionId, cols, rows);
					inst.lastSentCols = cols;
					inst.lastSentRows = rows;
				}, 80);
			}, 150);
		})
		.catch((err: unknown) => {
			xterm.writeln(`\r\n\x1b[31mFailed to start terminal: ${String(err)}\x1b[0m`);
		});

	inst.resizeObserver.observe(container);
	return inst;
};

export const attachTerminal = (
	leafId: string,
	container: HTMLElement,
	opts: CreateOptions = {},
): void => {
	let inst = instances.get(leafId);
	if (!inst) {
		inst = createInstance(leafId, container, opts);
		instances.set(leafId, inst);
		notifyStats();
		ensureDecayTimer();
	} else if (inst.currentContainer !== container) {
		// Move the existing xterm DOM element to the new container.
		if (inst.xterm.element && inst.xterm.element.parentElement !== container) {
			container.appendChild(inst.xterm.element);
		}
		inst.currentContainer = container;
		inst.resizeObserver.disconnect();
		inst.resizeObserver.observe(container);
		requestAnimationFrame(() => safeFit(inst!));
	}
	inst.xterm.focus();
};

export const detachTerminal = (leafId: string, container: HTMLElement): void => {
	const inst = instances.get(leafId);
	if (!inst) return;
	// Only detach if the container we were asked to detach from is the current one
	// (handles StrictMode/HMR cleanup → mount sequences correctly).
	if (inst.currentContainer !== container) return;
	inst.resizeObserver.disconnect();
	if (inst.xterm.element?.parentElement === container) {
		container.removeChild(inst.xterm.element);
	}
	inst.currentContainer = null;
};

export const disposeTerminal = (leafId: string): void => {
	const inst = instances.get(leafId);
	if (!inst) return;
	inst.disposed = true;
	instances.delete(leafId);
	// Each cleanup step is best-effort: a throw anywhere here used to abort the
	// caller (handleClose) before the tree could be updated, leaving the pane
	// visually alive after the shell had already been killed.
	if (inst.ptyResizeTimer) clearTimeout(inst.ptyResizeTimer);
	try {
		inst.resizeObserver.disconnect();
	} catch {}
	for (const off of inst.ipcUnsubs) {
		try {
			off();
		} catch {}
	}
	try {
		window.api.terminal.dispose(inst.sessionId);
	} catch {}
	try {
		inst.xterm.dispose();
	} catch {}
	try {
		notifyStats();
	} catch {}
	// Drop the leaf's activity so the store prunes its entry and re-rolls the
	// owning workspace's status.
	notifyActivity({ kind: "dispose", leafId });
};

export const focusTerminal = (leafId: string): void => {
	const inst = instances.get(leafId);
	if (!inst) return;
	inst.xterm.focus();
	// Focusing a pane acknowledges any latched done/needs-attention on it.
	notifyActivity({ kind: "focus", leafId });
};

export const getSessionId = (leafId: string): string | null => {
	return instances.get(leafId)?.sessionId ?? null;
};

// Reverse of getSessionId: the MCP bridge receives a PTY sessionId from main and
// needs the leafId to locate the pane/tab in the store.
export const getLeafIdBySession = (sessionId: string): string | null => {
	for (const inst of instances.values()) {
		if (inst.sessionId === sessionId) return inst.leafId;
	}
	return null;
};

export const getTerminalCwd = async (leafId: string): Promise<string | null> => {
	const inst = instances.get(leafId);
	if (!inst) return null;
	return window.api.terminal.getCwd(inst.sessionId);
};

// Record where this pane was teleported to so subsequent splits / new tabs
// spawn their shell there rather than at the PTY's (now-stale) origin cwd.
// See the `teleportedCwd` note on Instance.
export const setTeleportedCwd = (leafId: string, cwd: string): void => {
	const inst = instances.get(leafId);
	if (inst) inst.teleportedCwd = cwd;
};

export const getTeleportedCwd = (leafId: string): string | null => {
	return instances.get(leafId)?.teleportedCwd ?? null;
};

export const searchTerminal = (
	leafId: string,
	term: string,
	direction: "next" | "prev" = "next",
): void => {
	const inst = instances.get(leafId);
	if (!inst) return;
	const opts = { regex: false, caseSensitive: false };
	if (direction === "next") inst.search.findNext(term, opts);
	else inst.search.findPrevious(term, opts);
};

export type TerminalStat = {
	leafId: string;
	sessionId: string;
	rendererType: RendererType;
	cols: number;
	rows: number;
};

const statsListeners = new Set<() => void>();
const notifyStats = (): void => {
	for (const fn of statsListeners) fn();
};

export const subscribeStats = (fn: () => void): (() => void) => {
	statsListeners.add(fn);
	return () => {
		statsListeners.delete(fn);
	};
};

export const getStats = (): TerminalStat[] =>
	[...instances.values()].map((i) => ({
		leafId: i.leafId,
		sessionId: i.sessionId,
		rendererType: i.rendererType,
		cols: i.xterm.cols,
		rows: i.xterm.rows,
	}));
