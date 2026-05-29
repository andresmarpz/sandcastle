// Ordered around the color wheel so the picker reads as a smooth rainbow.
// Order is display-only; assignment is random, and saved colors key off the
// string name, so reordering never disturbs existing projects.
export const AVATAR_COLOR_KEYS = [
	"pink",
	"red",
	"orange",
	"amber",
	"lime",
	"grass",
	"mint",
	"cyan",
	"indigo",
	"purple",
] as const;
export type AvatarColorKey = (typeof AVATAR_COLOR_KEYS)[number];

export const AVATAR_COLOR_LABELS: Record<AvatarColorKey, string> = {
	pink: "Pink",
	red: "Red",
	orange: "Orange",
	amber: "Amber",
	lime: "Lime",
	grass: "Grass",
	mint: "Mint",
	cyan: "Cyan",
	indigo: "Indigo",
	purple: "Purple",
};

const STORAGE_KEY = "sandcastle:project-avatar-colors";

const segmenter =
	typeof Intl !== "undefined" && "Segmenter" in Intl
		? new Intl.Segmenter(undefined, { granularity: "grapheme" })
		: null;

export function firstGrapheme(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (!segmenter) return Array.from(trimmed)[0] ?? "";
	return segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? "";
}

export function loadColorMap(): Record<string, AvatarColorKey> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, string>;
		const out: Record<string, AvatarColorKey> = {};
		for (const [id, color] of Object.entries(parsed)) {
			if ((AVATAR_COLOR_KEYS as readonly string[]).includes(color)) {
				out[id] = color as AvatarColorKey;
			}
		}
		return out;
	} catch {
		return {};
	}
}

export function saveColorMap(map: Record<string, AvatarColorKey>): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		// localStorage unavailable; tolerate silently
	}
}

export function pickAvailableColor(used: Set<AvatarColorKey>): AvatarColorKey {
	const available = AVATAR_COLOR_KEYS.filter((c) => !used.has(c));
	const pool = available.length === 0 ? AVATAR_COLOR_KEYS : available;
	return pool[Math.floor(Math.random() * pool.length)] as AvatarColorKey;
}

export function assignColors(
	ids: readonly string[],
	existing: Record<string, AvatarColorKey>,
): Record<string, AvatarColorKey> {
	const used = new Set<AvatarColorKey>();
	for (const id of ids) {
		const c = existing[id];
		if (c) used.add(c);
	}
	let next = existing;
	let changed = false;
	for (const id of ids) {
		if (next[id]) continue;
		const color = pickAvailableColor(used);
		used.add(color);
		if (!changed) {
			next = { ...next };
			changed = true;
		}
		next[id] = color;
	}
	return changed ? next : existing;
}
