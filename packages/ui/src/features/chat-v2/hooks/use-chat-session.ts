"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	type ChatSessionContext,
	useChatSessionContext,
} from "../context/chat-session-context";
import { createRpcTransport } from "../lib/rpc-transport";
import type { AskUserEvent, SessionMetadata } from "../lib/transport-types";

/**
 * Return type for the useChatSession hook.
 */
export interface UseChatSessionReturn {
	// From useChat
	messages: ReturnType<typeof useChat>["messages"];
	sendMessage: ReturnType<typeof useChat>["sendMessage"];
	status: ReturnType<typeof useChat>["status"];
	error: ReturnType<typeof useChat>["error"];
	stop: ReturnType<typeof useChat>["stop"];

	// Session-specific
	sessionMetadata: SessionMetadata | null;
	pendingAskUser: AskUserEvent | null;
	respondToAskUser: (answers: Record<string, string>) => Promise<void>;
	config: ChatSessionContext["config"];
	updateValue: ChatSessionContext["updateValue"];
}

/**
 * Hook that wraps useChat with session management.
 * Gets sessionId/worktreeId from ChatSessionContext.
 *
 * Must be used within a ChatSessionProvider.
 */
export function useChatSession(): UseChatSessionReturn {
	const { config, updateValue } = useChatSessionContext();

	const [sessionMetadata, setSessionMetadata] =
		useState<SessionMetadata | null>(null);
	const [pendingAskUser, setPendingAskUser] = useState<AskUserEvent | null>(
		null,
	);

	const transport = useMemo(() => {
		return createRpcTransport(
			{
				sessionId: config.sessionId,
				worktreeId: config.worktreeId,
				claudeSessionId: config.claudeSessionId,
				rpcUrl: config.rpcUrl,
				autonomous: config.autonomous,
			},
			{
				onSessionStart: (csi) => updateValue({ claudeSessionId: csi }),
				onMetadata: setSessionMetadata,
				onAskUser: setPendingAskUser,
			},
		);
	}, [
		config.sessionId,
		config.worktreeId,
		config.claudeSessionId,
		config.rpcUrl,
		config.autonomous,
		updateValue,
	]);

	const { messages, sendMessage, status, error, stop, setMessages } = useChat({
		id: config.sessionId,
		transport,
		messages: config.initialMessages,
		onError: (err) => {
			console.error("[useChatSession] Error:", err);
		},
	});

	// Track if we've already set initial messages to avoid re-setting
	const hasSetInitialMessages = useRef(false);

	// // Set messages when initialMessages becomes available (async load)
	useEffect(() => {
		if (
			config.initialMessages &&
			config.initialMessages.length > 0 &&
			!hasSetInitialMessages.current
		) {
			setMessages(config.initialMessages);
			hasSetInitialMessages.current = true;
		}
	}, [config.initialMessages, setMessages]);

	// Reset the flag when session changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when sessionId changes
	useEffect(() => {
		hasSetInitialMessages.current = false;
	}, [config.sessionId]);

	// Handler for responding to AskUser
	const respondToAskUser = useCallback(
		async (answers: Record<string, string>) => {
			if (!pendingAskUser) return;

			// TODO: Call chat.respond RPC mutation when backend implements it
			// For now, log and clear the pending question
			console.log("[useChatSession] respondToAskUser:", {
				sessionId: config.sessionId,
				toolUseId: pendingAskUser.toolCallId,
				answers,
			});

			setPendingAskUser(null);
		},
		[config.sessionId, pendingAskUser],
	);

	return {
		messages,
		sendMessage,
		status,
		error,
		stop,
		sessionMetadata,
		pendingAskUser,
		respondToAskUser,
		config,
		updateValue,
	};
}
