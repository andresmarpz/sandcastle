import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
const terminal = {
    create: (opts) => ipcRenderer.invoke("terminal:create", opts),
    write: (id, data) => {
        ipcRenderer.send("terminal:input", id, data);
    },
    resize: (id, cols, rows) => {
        ipcRenderer.send("terminal:resize", id, cols, rows);
    },
    dispose: (id) => {
        ipcRenderer.send("terminal:dispose", id);
    },
    getCwd: (id) => ipcRenderer.invoke("terminal:get-cwd", id),
    onData: (id, listener) => {
        const channel = `terminal:data:${id}`;
        const handler = (_, data) => listener(data);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    },
    onExit: (id, listener) => {
        const channel = `terminal:exit:${id}`;
        const handler = (_, info) => listener(info);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    },
};
const menu = {
    popup: (items) => ipcRenderer.invoke("menu:popup", items),
};
const fileDialog = {
    pickDirectory: () => ipcRenderer.invoke("dialog:pick-directory"),
};
const caffeinate = {
    get: () => ipcRenderer.invoke("caffeinate:get"),
    set: (enabled) => ipcRenderer.invoke("caffeinate:set", enabled),
    onChange: (listener) => {
        const handler = (_, enabled) => listener(enabled);
        ipcRenderer.on("caffeinate:state", handler);
        return () => ipcRenderer.removeListener("caffeinate:state", handler);
    },
};
const api = { terminal, menu, caffeinate, dialog: fileDialog };
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld("electron", electronAPI);
        contextBridge.exposeInMainWorld("api", api);
    }
    catch (error) {
        console.error(error);
    }
}
else {
    globalThis.electron = electronAPI;
    globalThis.api = api;
}
