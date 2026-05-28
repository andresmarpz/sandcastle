import { create } from "zustand";
import { persist } from "zustand/middleware";

// Notification-sound preferences. Persisted to localStorage so they survive
// restarts, mirroring the tabs store's persist pattern (sandcastle.tabs.v1).
type SoundSettings = {
	muted: boolean;
	/** 0..100. Scales the synthesized cue's peak gain. */
	volume: number;
	setMuted: (muted: boolean) => void;
	setVolume: (volume: number) => void;
};

const clampVolume = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

export const useSoundSettings = create<SoundSettings>()(
	persist(
		(set) => ({
			muted: false,
			volume: 80,
			setMuted: (muted) => set({ muted }),
			setVolume: (volume) => set({ volume: clampVolume(volume) }),
		}),
		{
			name: "sandcastle.sound.v1",
			partialize: (s) => ({ muted: s.muted, volume: s.volume }),
		},
	),
);
