import { useSoundSettings } from "@/stores/soundSettings";

// Notification cues are synthesized with the Web Audio API rather than shipped
// as audio files: the cues are short chimes (1-2 tones) that render identically
// cross-platform with zero bundle weight and no asset/licensing surface.
export type Cue = "attention" | "complete";

let ctx: AudioContext | null = null;

// The AudioContext can only start after a user gesture (autoplay policy). We
// create it lazily and try to resume on every play; the very first background
// cue of a session may be silently dropped if the user hasn't interacted yet,
// which is acceptable (and unavoidable) for desktop notification sounds.
const getContext = (): AudioContext | null => {
	if (typeof window === "undefined") return null;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	if (!ctx) {
		try {
			ctx = new Ctor();
		} catch {
			return null;
		}
	}
	if (ctx.state === "suspended") void ctx.resume().catch(() => {});
	return ctx;
};

// A single enveloped sine tone. Short attack + exponential decay keeps it soft
// and click-free.
const tone = (
	ac: AudioContext,
	freq: number,
	start: number,
	duration: number,
	peak: number,
): void => {
	const osc = ac.createOscillator();
	const gain = ac.createGain();
	osc.type = "sine";
	osc.frequency.setValueAtTime(freq, start);
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.linearRampToValueAtTime(peak, start + 0.015);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	osc.connect(gain).connect(ac.destination);
	osc.start(start);
	osc.stop(start + duration + 0.02);
};

export const playCue = (cue: Cue): void => {
	const { muted, volume } = useSoundSettings.getState();
	if (muted || volume <= 0) return;
	const ac = getContext();
	if (!ac) return;

	const peak = (volume / 100) * 0.18;
	const t0 = ac.currentTime + 0.01;
	try {
		if (cue === "complete") {
			// Soft two-note rising chime — "your agent finished".
			tone(ac, 660, t0, 0.13, peak);
			tone(ac, 880, t0 + 0.11, 0.17, peak);
		} else {
			// More insistent double tone — "your agent needs you".
			tone(ac, 520, t0, 0.13, peak);
			tone(ac, 520, t0 + 0.18, 0.17, peak);
		}
	} catch {
		// AudioContext torn down mid-call — ignore.
	}
};
