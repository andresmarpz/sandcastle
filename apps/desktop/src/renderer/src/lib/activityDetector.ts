// Byte-path "working" detection.
//
// The authoritative Claude activity status comes from Claude Code lifecycle
// hooks (see stores/activity.ts + main/claudeHooks.ts). This module provides a
// best-effort *fallback* "Claude is generating" signal scraped from the raw
// terminal output, used before the hooks are installed/firing or for agents
// that don't emit them. It is intentionally narrow: it only ever asserts
// "working", never "needs-attention"/"done" — those states are unreliable to
// derive from terminal text and are owned by the hook path instead.

// How long after the last spinner sighting we keep reporting "working". The
// spinner is redrawn continuously while Claude generates, so any real gap
// longer than this means the turn ended.
export const DECAY_MS = 6000;

// Keep a small rolling window of recent (stripped) output so the marker still
// matches when it lands split across two pty chunks.
const TAIL_LEN = 256;

// Claude Code prints "esc to interrupt" beneath its spinner while a turn is in
// flight and stops once it finishes. It's the most stable, Claude-specific
// "working" marker in the TUI. If it ever changes, the hook path still drives
// working state, so this degrades gracefully rather than breaking the feature.
const WORKING_RE = /esc to interrupt/i;

// Strip the ANSI control sequences Claude interleaves with its UI so the plain
// marker text is contiguous for matching. Cheap, runs on the terminal hot path.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC/BEL is the point — stripping ANSI control sequences.
const CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC/BEL is the point — stripping ANSI control sequences.
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export const stripAnsi = (s: string): string => s.replace(OSC_RE, "").replace(CSI_RE, "");

/**
 * Fold a new output chunk into the rolling tail and report whether the working
 * marker is currently present. Returns the next tail (already ANSI-stripped and
 * bounded to TAIL_LEN) to carry into the following call.
 */
export const scanWorking = (tail: string, chunk: string): { tail: string; working: boolean } => {
	const combined = stripAnsi(tail + chunk);
	const working = WORKING_RE.test(combined);
	const next = combined.length > TAIL_LEN ? combined.slice(combined.length - TAIL_LEN) : combined;
	return { tail: next, working };
};
