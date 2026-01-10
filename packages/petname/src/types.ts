/**
 * Options for generating a petname
 */
export interface GenerateOptions {
	/** Number of words in the petname (default: 2) */
	wordCount?: number;
	/** Separator between words (default: "-") */
	separator?: string;
}

/**
 * A generated petname with metadata
 */
export interface Petname {
	/** The complete petname string (e.g., "brave-sunset") */
	name: string;
	/** Individual words that make up the petname */
	words: readonly string[];
}
