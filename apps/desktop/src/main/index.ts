import { join } from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import type { MenuItemConstructorOptions } from "electron";
import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell } from "electron";
import icon from "../../resources/icon.png?asset";
import { disposeCaffeinate, registerCaffeinateHandlers } from "./caffeinate";
import { disposeAllSessions, primeWarmPool, registerPtyHandlers } from "./pty";
import { captureUserEnv } from "./userEnv";

const APP_ID = "com.sandcastle.desktop";
const APP_NAME = "Sandcastle";

type MenuPopupItem =
	| { type: "separator" }
	| {
			type?: "normal";
			id: string;
			label: string;
			enabled?: boolean;
			accelerator?: string;
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

function createWindow(): void {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 960,
		show: false,
		autoHideMenuBar: true,
		title: APP_NAME,
		icon,
		backgroundColor: "#000000",
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: 12 },
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

void app.whenReady().then(() => {
	electronApp.setAppUserModelId(APP_ID);

	if (process.platform === "darwin") {
		const dockIcon = nativeImage.createFromPath(icon);
		if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
	}

	app.on("browser-window-created", (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	ipcMain.on("ping", () => console.log("pong"));

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

	registerPtyHandlers();
	registerCaffeinateHandlers();
	primeWarmPool();

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
});
