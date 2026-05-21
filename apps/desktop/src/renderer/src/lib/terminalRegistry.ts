import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITheme, Terminal as XTerm } from "@xterm/xterm";

type CreateOptions = {
	cwd?: string;
	shell?: string;
};

export type RendererType = "webgl" | "canvas" | "dom";

type Instance = {
	leafId: string;
	sessionId: string;
	xterm: XTerm;
	fit: FitAddon;
	search: SearchAddon;
	rendererType: RendererType;
	currentContainer: HTMLElement | null;
	resizeObserver: ResizeObserver;
	resizeTimer: ReturnType<typeof setTimeout> | null;
	ipcUnsubs: Array<() => void>;
	disposed: boolean;
};

const FONT_FAMILY = '"JetBrainsMono Nerd Font", "MesloLGS NF", "Menlo", "Monaco", monospace';

export type TerminalThemeMode = "light" | "dark";

const DARK_THEME: ITheme = {
	background: "#0a0a0a",
	foreground: "#e6e6e6",
	cursor: "#e6e6e6",
	cursorAccent: "#0a0a0a",
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

const LIGHT_THEME: ITheme = {
	background: "#ffffff",
	foreground: "#1a1a1a",
	cursor: "#1a1a1a",
	cursorAccent: "#ffffff",
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

let currentTheme: ITheme = DARK_THEME;

const instances = new Map<string, Instance>();

export const setTerminalTheme = (mode: TerminalThemeMode): void => {
	const next = mode === "light" ? LIGHT_THEME : DARK_THEME;
	if (next === currentTheme) return;
	currentTheme = next;
	for (const inst of instances.values()) {
		inst.xterm.options.theme = next;
	}
};

const createXterm = (): { xterm: XTerm; fit: FitAddon; search: SearchAddon } => {
	const xterm = new XTerm({
		fontFamily: FONT_FAMILY,
		fontSize: 13,
		lineHeight: 1,
		letterSpacing: 0,
		cursorBlink: false,
		allowProposedApi: true,
		scrollback: 10000,
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

const loadPostOpenAddons = (xterm: XTerm): RendererType => {
	try {
		const webgl = new WebglAddon();
		webgl.onContextLoss(() => webgl.dispose());
		xterm.loadAddon(webgl);
		return "webgl";
	} catch {
		try {
			xterm.loadAddon(new CanvasAddon());
			return "canvas";
		} catch {
			return "dom";
		}
	}
};

const safeFit = (inst: Instance): void => {
	if (!inst.currentContainer) return;
	try {
		inst.fit.fit();
	} catch {
		// container not yet sized
	}
};

const scheduleResize = (inst: Instance): void => {
	if (inst.resizeTimer) clearTimeout(inst.resizeTimer);
	inst.resizeTimer = setTimeout(() => {
		inst.resizeTimer = null;
		safeFit(inst);
		if (!inst.disposed) {
			window.api.terminal.resize(inst.sessionId, inst.xterm.cols, inst.xterm.rows);
		}
	}, 50);
};

const createInstance = (leafId: string, container: HTMLElement, opts: CreateOptions): Instance => {
	const { xterm, fit, search } = createXterm();
	const sessionId = `term-${leafId}-${Date.now()}`;

	xterm.open(container);
	const rendererType = loadPostOpenAddons(xterm);

	// macOS line-editing shortcuts that xterm.js doesn't bind by default.
	// We intercept before xterm processes the key, then write the equivalent
	// readline/ZLE control byte into the PTY ourselves.
	xterm.attachCustomKeyEventHandler((e) => {
		if (e.type !== "keydown") return true;
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
		rendererType,
		currentContainer: container,
		resizeObserver: new ResizeObserver(() => scheduleResize(inst)),
		resizeTimer: null,
		ipcUnsubs: [],
		disposed: false,
	};

	requestAnimationFrame(() => safeFit(inst));

	inst.ipcUnsubs.push(window.api.terminal.onData(sessionId, (data) => xterm.write(data)));
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
			cols: xterm.cols,
			rows: xterm.rows,
			cwd: opts.cwd,
			shell: opts.shell,
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
	if (inst.resizeTimer) clearTimeout(inst.resizeTimer);
	inst.resizeObserver.disconnect();
	for (const off of inst.ipcUnsubs) off();
	window.api.terminal.dispose(inst.sessionId);
	inst.xterm.dispose();
	notifyStats();
};

export const focusTerminal = (leafId: string): void => {
	instances.get(leafId)?.xterm.focus();
};

export const getTerminalCwd = async (leafId: string): Promise<string | null> => {
	const inst = instances.get(leafId);
	if (!inst) return null;
	return window.api.terminal.getCwd(inst.sessionId);
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
