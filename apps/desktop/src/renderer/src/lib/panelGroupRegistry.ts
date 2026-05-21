import type { GroupImperativeHandle } from "react-resizable-panels";

const groups = new Map<string, GroupImperativeHandle>();

export const registerPanelGroup = (id: string, handle: GroupImperativeHandle): void => {
	groups.set(id, handle);
};

export const unregisterPanelGroup = (id: string): void => {
	groups.delete(id);
};

export const getPanelGroup = (id: string): GroupImperativeHandle | undefined => groups.get(id);
