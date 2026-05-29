import { join } from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import type { MenuItemConstructorOptions } from "electron";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	nativeImage,
	nativeTheme,
	screen,
	shell,
} from "electron";
import icon from "../../resources/icon.png?asset";
import { disposeCaffeinate, registerCaffeinateHandlers } from "./caffeinate";
import { disposeClaudeHooks, registerClaudeHookHandlers } from "./claudeHooks";
import { disposeMcp, registerMcpServer } from "./mcp";
import { disposeAllSessions, registerPtyHandlers } from "./pty";
import { captureUserEnv } from "./userEnv";

// Use a distinct identity for unpackaged (dev / preview) runs so a packaged
// "stable" install can run alongside `electron-vite dev` without colliding on
// the single-instance lock or sharing userData with the production build.
const APP_ID = app.isPackaged ? "com.sandcastle.desktop" : "com.sandcastle.desktop.dev";
const APP_NAME = app.isPackaged ? "Sandcastle" : "Sandcastle Dev";

type MenuPopupItem =
	| { type: "separator" }
	| {
			type?: "normal";
			id: string;
			label: string;
			enabled?: boolean;
			accelerator?: string;
	  };

// Electron's default macOS menu binds Cmd+W to "Close Window", which races with
// our renderer-owned pane/tab close logic. Install a minimal menu that omits
// that accelerator so the renderer is the only Cmd+W handler.
const installApplicationMenu = (): void => {
	const isMac = process.platform === "darwin";
	const template: MenuItemConstructorOptions[] = [];

	if (isMac) {
		template.push({
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		});
	}

	template.push({
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
		],
	});

	template.push({
		label: "Window",
		submenu: isMac
			? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
			: [{ role: "minimize" }],
	});

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
app.setPath("userData", join(app.getPath("appData"), APP_ID));

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

// Start capturing the user's shell environment as early as possible so PTYs
// spawned shortly after window load can read PATH etc. from process.env
// without each pane re-running a login shell.
void captureUserEnv();

function getInitialWindowSize(): { width: number; height: number } {
	const cursorPoint = screen.getCursorScreenPoint();
	const { workAreaSize } = screen.getDisplayNearestPoint(cursorPoint);
	// Treat anything ≥ ~2.2K wide as a large external display (4K, ultrawide, etc.).
	// On laptop-class displays use ~80% width and full height; on large displays
	// clamp to a comfortable size so the window doesn't spawn tiny on a 4K panel.
	const isLargeDisplay = workAreaSize.width >= 2200;
	const width = isLargeDisplay
		? Math.max(1680, Math.round(workAreaSize.width * 0.6))
		: Math.round(workAreaSize.width * 0.8);
	const height = isLargeDisplay
		? Math.max(1260, Math.round(workAreaSize.height * 0.7))
		: workAreaSize.height;
	return { width, height };
}

function createWindow(): void {
	const { width, height } = getInitialWindowSize();
	const mainWindow = new BrowserWindow({
		width,
		height,
		show: false,
		autoHideMenuBar: true,
		title: APP_NAME,
		icon,
		// Match the resolved --background (bg-deep) token so the traffic-light
		// gutter paints the correct color before the renderer mounts.
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#080808" : "#fafafa",
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 12, y: 14 },
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
		},
	});

	mainWindow.on("ready-to-show", () => {
		mainWindow.show();
	});

	mainWindow.webContents.on("context-menu", (_event, params) => {
		const template: MenuItemConstructorOptions[] = [];
		const { isEditable, editFlags, selectionText, linkURL, misspelledWord, dictionarySuggestions } =
			params;

		if (misspelledWord) {
			for (const suggestion of dictionarySuggestions ?? []) {
				template.push({
					label: suggestion,
					click: () => mainWindow.webContents.replaceMisspelling(suggestion),
				});
			}
			if (dictionarySuggestions?.length) template.push({ type: "separator" });
			template.push({
				label: "Add to Dictionary",
				click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(misspelledWord),
			});
			template.push({ type: "separator" });
		}

		if (isEditable) {
			template.push(
				{ role: "cut", enabled: editFlags.canCut },
				{ role: "copy", enabled: editFlags.canCopy },
				{ role: "paste", enabled: editFlags.canPaste },
				{ type: "separator" },
				{ role: "selectAll", enabled: editFlags.canSelectAll },
			);
		} else if (selectionText && selectionText.trim().length > 0) {
			template.push({ role: "copy" });
		}

		if (linkURL) {
			if (template.length > 0) template.push({ type: "separator" });
			template.push(
				{
					label: "Open Link",
					click: () => void shell.openExternal(linkURL),
				},
				{
					label: "Copy Link",
					click: () => mainWindow.webContents.copy(),
				},
			);
		}

		if (is.dev) {
			if (template.length > 0) template.push({ type: "separator" });
			template.push({
				label: "Inspect Element",
				click: () => mainWindow.webContents.inspectElement(params.x, params.y),
			});
		}

		if (template.length === 0) return;
		Menu.buildFromTemplate(template).popup({ window: mainWindow });
	});

	mainWindow.webContents.setWindowOpenHandler((details) => {
		void shell.openExternal(details.url);
		return { action: "deny" };
	});

	if (is.dev && process.env.ELECTRON_RENDERER_URL) {
		void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

void app.whenReady().then(async () => {
	electronApp.setAppUserModelId(APP_ID);

	if (process.platform === "darwin") {
		const dockIcon = nativeImage.createFromPath(icon);
		if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
	}

	app.on("browser-window-created", (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	ipcMain.on("ping", () => console.log("pong"));

	ipcMain.handle("dialog:pick-directory", async (event): Promise<string | null> => {
		const win = BrowserWindow.fromWebContents(event.sender);
		const options: Electron.OpenDialogOptions = {
			properties: ["openDirectory", "createDirectory"],
		};
		const result = win
			? await dialog.showOpenDialog(win, options)
			: await dialog.showOpenDialog(options);
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0] ?? null;
	});

	ipcMain.handle("menu:popup", (event, items: Array<MenuPopupItem>): Promise<string | null> => {
		return new Promise((resolve) => {
			let resolved = false;
			const template: MenuItemConstructorOptions[] = items.map((item) => {
				if (item.type === "separator") return { type: "separator" };
				return {
					label: item.label,
					enabled: item.enabled !== false,
					accelerator: item.accelerator,
					click: () => {
						resolved = true;
						resolve(item.id);
					},
				};
			});
			const menu = Menu.buildFromTemplate(template);
			const win = BrowserWindow.fromWebContents(event.sender);
			menu.popup({
				window: win ?? undefined,
				callback: () => {
					if (!resolved) resolve(null);
				},
			});
		});
	});

	ipcMain.on("window:close", (event) => {
		BrowserWindow.fromWebContents(event.sender)?.close();
	});

	registerPtyHandlers();
	registerCaffeinateHandlers();
	void registerClaudeHookHandlers().catch((err) =>
		console.warn("[claudeHooks] failed to register:", err),
	);
	// Start the in-process MCP server before the first PTY can spawn so the
	// per-session injection env is ready for any `claude` launched in a pane.
	// Never let an MCP startup failure block the window / terminals.
	try {
		await registerMcpServer();
	} catch (err) {
		console.error("[sandcastle] MCP server init failed; continuing without it:", err);
	}

	installApplicationMenu();
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("second-instance", () => {
	const win = BrowserWindow.getAllWindows()[0];
	if (win) {
		if (win.isMinimized()) win.restore();
		win.show();
		win.focus();
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	disposeAllSessions();
	disposeCaffeinate();
	disposeClaudeHooks();
	disposeMcp();
});
