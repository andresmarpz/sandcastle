/**
 * Model display name mappings and pricing.
 *
 * Maps Claude model IDs to human-readable display names, context windows, and pricing.
 * Pricing is in USD per million tokens.
 */

export interface ModelPricing {
	/** Base input token price per million tokens */
	inputPerMTok: number;
	/** Output token price per million tokens */
	outputPerMTok: number;
	/** Cache write price per million tokens (5 minute TTL) */
	cacheWritePerMTok: number;
	/** Cache read/hit price per million tokens */
	cacheReadPerMTok: number;
}

export interface ModelInfo {
	displayName: string;
	shortName: string;
	/** Context window size in tokens */
	contextWindow: number;
	/** Pricing per million tokens */
	pricing: ModelPricing;
}

/**
 * Known Claude model mappings.
 * Keys are model ID prefixes that will be matched against the full model ID.
 *
 * Pricing source: https://www.anthropic.com/pricing
 */
const MODEL_MAP: Record<string, ModelInfo> = {
	"claude-opus-4-5": {
		displayName: "Claude Opus 4.5",
		shortName: "Opus 4.5",
		contextWindow: 200_000,
		pricing: {
			inputPerMTok: 5,
			outputPerMTok: 25,
			cacheWritePerMTok: 6.25,
			cacheReadPerMTok: 0.5,
		},
	},
	"claude-sonnet-4-5": {
		displayName: "Claude Sonnet 4.5",
		shortName: "Sonnet 4.5",
		contextWindow: 200_000,
		pricing: {
			inputPerMTok: 3,
			outputPerMTok: 15,
			cacheWritePerMTok: 3.75,
			cacheReadPerMTok: 0.3,
		},
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

/**
 * Get the context window size for a model.
 *
 * @param modelId - The full model ID
 * @returns Context window in tokens, or null if unknown
 */
export function getModelContextWindow(modelId: string | null): number | null {
	if (!modelId) return null;

	const info = getModelInfo(modelId);
	return info?.contextWindow ?? null;
}

/**
 * Calculate the cost in USD from token usage.
 *
 * @param modelId - The full model ID
 * @param usage - Token usage counts
 * @returns Cost in USD, or null if model is unknown
 */
export function calculateCostFromTokens(
	modelId: string | null,
	usage: {
		inputTokens?: number;
		outputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
	},
): number | null {
	if (!modelId) return null;

	const info = getModelInfo(modelId);
	if (!info) return null;

	const { pricing } = info;
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	const cacheReadTokens = usage.cacheReadInputTokens ?? 0;
	const cacheWriteTokens = usage.cacheCreationInputTokens ?? 0;

	// Calculate cost: tokens / 1_000_000 * price_per_million
	const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
	const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
	const cacheReadCost =
		(cacheReadTokens / 1_000_000) * pricing.cacheReadPerMTok;
	const cacheWriteCost =
		(cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMTok;

	return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}
