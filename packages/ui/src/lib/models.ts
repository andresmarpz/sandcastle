/**
 * Model display name mappings.
 *
 * Maps Claude model IDs to human-readable display names.
 */

export interface ModelInfo {
	displayName: string;
	shortName: string;
}

/**
 * Known Claude model mappings.
 * Keys are model ID prefixes that will be matched against the full model ID.
 */
const MODEL_MAP: Record<string, ModelInfo> = {
	"claude-opus-4-5": {
		displayName: "Claude Opus 4.5",
		shortName: "Opus 4.5",
	},
	"claude-opus-4": {
		displayName: "Claude Opus 4",
		shortName: "Opus 4",
	},
	"claude-sonnet-4": {
		displayName: "Claude Sonnet 4",
		shortName: "Sonnet 4",
	},
	"claude-3-5-sonnet": {
		displayName: "Claude 3.5 Sonnet",
		shortName: "3.5 Sonnet",
	},
	"claude-3-5-haiku": {
		displayName: "Claude 3.5 Haiku",
		shortName: "3.5 Haiku",
	},
	"claude-3-opus": {
		displayName: "Claude 3 Opus",
		shortName: "3 Opus",
	},
	"claude-3-sonnet": {
		displayName: "Claude 3 Sonnet",
		shortName: "3 Sonnet",
	},
	"claude-3-haiku": {
		displayName: "Claude 3 Haiku",
		shortName: "3 Haiku",
	},
};

/**
 * Get display info for a model ID.
 *
 * @param modelId - The full model ID (e.g., "claude-opus-4-5-20251101")
 * @returns Model info with display name, or null if unknown
 */
export function getModelInfo(modelId: string | null): ModelInfo | null {
	if (!modelId) return null;

	// Try to match against known prefixes (longest match first)
	const prefixes = Object.keys(MODEL_MAP).sort((a, b) => b.length - a.length);

	for (const prefix of prefixes) {
		if (modelId.startsWith(prefix)) {
			return MODEL_MAP[prefix] ?? null;
		}
	}

	return null;
}

/**
 * Get the display name for a model ID.
 *
 * @param modelId - The full model ID
 * @returns Human-readable display name, or the original ID if unknown
 */
export function getModelDisplayName(modelId: string | null): string | null {
	if (!modelId) return null;

	const info = getModelInfo(modelId);
	return info?.displayName ?? modelId;
}
