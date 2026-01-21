import { Schema } from "effect";

export class GitDiffStats extends Schema.Class<GitDiffStats>("GitDiffStats")({
	filesChanged: Schema.Number,
	insertions: Schema.Number,
	deletions: Schema.Number,
}) {}
