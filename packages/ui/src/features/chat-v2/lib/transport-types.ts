import type { AskUserQuestionItem } from "@sandcastle/rpc";

/**
 * Configuration for the RPC transport.
 */
export interface RpcTransportConfig {
	/** Storage session ID */
	sessionId: string;
	/** Worktree ID for working directory context */
	worktreeId: string;
	/** Claude SDK session ID for resume (optional) */
	claudeSessionId?: string | null;
	/** RPC endpoint URL */
	rpcUrl?: string;
	/** Enable autonomous mode */
	autonomous?: boolean;
}

/**
 * Session metadata returned on stream finish.
 */
export interface SessionMetadata {
	claudeSessionId: string | null;
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
}

/**
 * AskUser event data for rendering the dialog.
 */
export interface AskUserEvent {
	toolCallId: string;
	questions: readonly AskUserQuestionItem[];
}

/**
 * Callbacks for transport events.
 */
export interface TransportCallbacks {
	/** Called when AskUser event is received - must respond to continue */
	onAskUser?: (event: AskUserEvent) => void;
	/** Called when session metadata is available (on finish) */
	onMetadata?: (metadata: SessionMetadata) => void;
	/** Called when claudeSessionId is received (on start) */
	onSessionStart?: (claudeSessionId: string) => void;
}
