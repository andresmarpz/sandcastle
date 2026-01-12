"use client";

import type { UIMessage } from "ai";
import { createContext, type ReactNode, useContext } from "react";
import { RPC_URL } from "@/api/config";

export interface ChatSessionContextValue {
	sessionId: string;
	worktreeId: string;
	claudeSessionId: string | null;
	rpcUrl?: string;
	autonomous?: boolean;
	initialMessages?: UIMessage[];
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export interface ChatSessionProviderProps {
	children: ReactNode;
	sessionId: string;
	worktreeId: string;
	claudeSessionId?: string | null;
	rpcUrl?: string;
	autonomous?: boolean;
	initialMessages?: UIMessage[];
}

export function ChatSessionProvider({
	children,
	sessionId,
	worktreeId,
	claudeSessionId = null,
	rpcUrl = RPC_URL,
	autonomous,
	initialMessages,
}: ChatSessionProviderProps) {
	return (
		<ChatSessionContext.Provider
			value={{
				sessionId,
				worktreeId,
				claudeSessionId,
				rpcUrl,
				autonomous,
				initialMessages,
			}}
		>
			{children}
		</ChatSessionContext.Provider>
	);
}

export function useChatSessionContext(): ChatSessionContextValue {
	const context = useContext(ChatSessionContext);
	if (!context) {
		throw new Error(
			"useChatSessionContext must be used within ChatSessionProvider",
		);
	}
	return context;
}
