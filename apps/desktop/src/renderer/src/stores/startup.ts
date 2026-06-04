import { create } from "zustand";

// App bring-up phase. `main.tsx` overlays the LoadingScreen while `loading` and
// reveals the app once `runStartup` (see lib/startup.ts) flips it to `ready` —
// after server data is warm and the landing workspace's terminals first paint.
export type StartupPhase = "loading" | "ready";

type State = {
	phase: StartupPhase;
};

type Actions = {
	setReady: () => void;
};

export const useStartupStore = create<State & Actions>()((set) => ({
	phase: "loading",
	setReady: () => set({ phase: "ready" }),
}));
