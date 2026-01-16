"use client";

import type { UIMessage } from "ai";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";
import { RPC_URL } from "@/api/config";

export interface ChatSessionContextValue {
	sessionId: string;
	worktreeId: string;
	claudeSessionId: string | null;
	rpcUrl?: string;
	autonomous?: boolean;
	initialMessages?: UIMessage[];
}

export type UpdateChatSessionContextValue = (
	params: Partial<ChatSessionContextValue>,
) => unknown;

export type ChatSessionContext = {
	config: ChatSessionContextValue;
	updateValue: UpdateChatSessionContextValue;
};

const ChatSessionContext = createContext<ChatSessionContext | null>(null);

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
	autonomous = false,
	initialMessages,
}: ChatSessionProviderProps) {
	const [config, setConfig] = useState<ChatSessionContextValue>({
		sessionId,
		worktreeId,
		claudeSessionId,
		rpcUrl,
		autonomous,
		initialMessages,
	});

	const updateValue: UpdateChatSessionContextValue = useCallback(
		(params: Partial<ChatSessionContextValue>) => {
			setConfig((cfg) => ({
				...cfg,
				...params,
			}));
		},
		[],
	);

	const returnable = {
		config,
		updateValue,
	};

	return (
		<ChatSessionContext.Provider value={returnable}>
			{children}
		</ChatSessionContext.Provider>
	);
}

export function useChatSessionContext(): ChatSessionContext {
	const context = useContext(ChatSessionContext);
	if (!context) {
		throw new Error(
			"useChatSessionContext must be used within ChatSessionProvider",
		);
	}

	return context;
}
