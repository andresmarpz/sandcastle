import {
	Result,
	useAtom,
	useAtomRefresh,
	useAtomValue,
} from "@effect-atom/atom-react";
import * as Option from "effect/Option";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import {
	createSessionMutation,
	SESSION_LIST_KEY,
	sessionListByWorktreeAtomFamily,
} from "@/api/session-atoms";
import { worktreeAtomFamily } from "@/api/worktree-atoms";
import {
	Panel,
	PanelBody,
	PanelContent,
	PanelHeader,
	type PanelTab,
} from "@/components/panel";
import { Skeleton } from "@/components/skeleton";
import { Spinner } from "@/components/spinner";
import { ChatView } from "@/features/chat";

interface SessionTab extends PanelTab {
	sessionId: string;
}

export function WorktreePage() {
	const { worktreeId } = useParams<{ worktreeId: string }>();

	if (!worktreeId) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				No worktree selected
			</div>
		);
	}

	return <WorktreePageContent worktreeId={worktreeId} />;
}

function WorktreePageContent({ worktreeId }: { worktreeId: string }) {
	const sessionsResult = useAtomValue(
		sessionListByWorktreeAtomFamily(worktreeId),
	);
	const worktreeResult = useAtomValue(worktreeAtomFamily(worktreeId));
	const refreshSessions = useAtomRefresh(
		sessionListByWorktreeAtomFamily(worktreeId),
	);
	const [, createSession] = useAtom(createSessionMutation, {
		mode: "promiseExit",
	});
	const [isCreatingSession, setIsCreatingSession] = useState(false);

	const sessions = useMemo(
		() => Option.getOrElse(Result.value(sessionsResult), () => []),
		[sessionsResult],
	);

	const sortedSessions = useMemo(
		() =>
			[...sessions].sort((a, b) => {
				const aTime = Date.parse(a.lastActivityAt);
				const bTime = Date.parse(b.lastActivityAt);
				return (
					(Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
				);
			}),
		[sessions],
	);

	// Map sessions to tabs
	const tabs: SessionTab[] = useMemo(
		() =>
			sortedSessions.map((session) => ({
				id: session.id,
				sessionId: session.id,
				label: session.title || "Untitled",
			})),
		[sortedSessions],
	);

	const [activeTab, setActiveTab] = useState<string | null>(
		() => tabs[0]?.id ?? null,
	);

	// Keep activeTab in sync with available tabs
	const effectiveActiveTab = useMemo(() => {
		if (activeTab && tabs.some((t) => t.id === activeTab)) {
			return activeTab;
		}
		return tabs[0]?.id ?? null;
	}, [activeTab, tabs]);

	const handleTabClose = (id: string) => {
		// For now, just switch tabs - we don't delete sessions on tab close
		if (effectiveActiveTab === id && tabs.length > 1) {
			const currentIndex = tabs.findIndex((t) => t.id === id);
			const nextTab = tabs[currentIndex + 1] ?? tabs[currentIndex - 1];
			setActiveTab(nextTab?.id ?? null);
		}
	};

	const handleAddTab = async () => {
		if (isCreatingSession) return;

		// Get worktree to pass its path
		const worktree = Option.getOrUndefined(Result.value(worktreeResult));
		if (!worktree) return;

		setIsCreatingSession(true);
		try {
			const result = await createSession({
				payload: {
					worktreeId,
					workingPath: worktree.path,
					title: "New session",
				},
				reactivityKeys: [SESSION_LIST_KEY, `sessions:worktree:${worktreeId}`],
			});

			if (result._tag === "Success") {
				setActiveTab(result.value.id);
			} else {
				refreshSessions();
			}
		} finally {
			setIsCreatingSession(false);
		}
	};

	const hasSessionCache = Option.isSome(Result.value(sessionsResult));

	return Result.matchWithWaiting(sessionsResult, {
		onWaiting: () =>
			hasSessionCache ? (
				<WorktreePanelView
					worktreeId={worktreeId}
					tabs={tabs}
					activeTab={effectiveActiveTab}
					onActiveTabChange={setActiveTab}
					onTabClose={handleTabClose}
					onAddTab={handleAddTab}
					isCreatingSession={isCreatingSession}
				/>
			) : (
				<SessionsLoading />
			),
		onError: () => (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Failed to load sessions
			</div>
		),
		onDefect: () => (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Failed to load sessions
			</div>
		),
		onSuccess: () => (
			<WorktreePanelView
				worktreeId={worktreeId}
				tabs={tabs}
				activeTab={effectiveActiveTab}
				onActiveTabChange={setActiveTab}
				onTabClose={handleTabClose}
				onAddTab={handleAddTab}
				isCreatingSession={isCreatingSession}
			/>
		),
	});
}

interface WorktreePanelViewProps {
	worktreeId: string;
	tabs: SessionTab[];
	activeTab: string | null;
	onActiveTabChange: (id: string) => void;
	onTabClose: (id: string) => void;
	onAddTab: () => void;
	isCreatingSession: boolean;
}

function WorktreePanelView({
	worktreeId,
	tabs,
	activeTab,
	onActiveTabChange,
	onTabClose,
	onAddTab,
	isCreatingSession,
}: WorktreePanelViewProps) {
	const [orderedTabs, setOrderedTabs] = useState(tabs);

	// Sync orderedTabs when tabs change (new session added, etc.)
	useMemo(() => {
		const currentIds = new Set(orderedTabs.map((t) => t.id));
		const newIds = new Set(tabs.map((t) => t.id));

		// Add new tabs that aren't in orderedTabs
		const newTabs = tabs.filter((t) => !currentIds.has(t.id));
		// Keep existing order for tabs that still exist
		const existingTabs = orderedTabs.filter((t) => newIds.has(t.id));

		if (newTabs.length > 0 || existingTabs.length !== orderedTabs.length) {
			setOrderedTabs([...existingTabs, ...newTabs]);
		}
	}, [tabs, orderedTabs]);

	// Handle reorder from Panel, preserving SessionTab type
	const handleTabsReorder = (reorderedPanelTabs: PanelTab[]) => {
		// Map back to SessionTab using the original tab data
		const reordered = reorderedPanelTabs
			.map((pt) => orderedTabs.find((t) => t.id === pt.id))
			.filter((t): t is SessionTab => t !== undefined);
		setOrderedTabs(reordered);
	};

	if (tabs.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
				<p>No sessions yet</p>
				<button
					type="button"
					onClick={onAddTab}
					disabled={isCreatingSession}
					className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>
					{isCreatingSession ? (
						<span className="flex items-center gap-2">
							<Spinner className="size-4" />
							Creating...
						</span>
					) : (
						"Create session"
					)}
				</button>
			</div>
		);
	}

	return (
		<Panel
			className="h-full"
			tabs={orderedTabs}
			activeTab={activeTab}
			onActiveTabChange={onActiveTabChange}
			onTabClose={onTabClose}
			onTabsReorder={handleTabsReorder}
			onAddClick={onAddTab}
			closable={false}
		>
			<PanelHeader />
			<PanelBody>
				{orderedTabs.map((tab) => (
					<PanelContent key={tab.id} value={tab.id}>
						<ChatView sessionId={tab.sessionId} worktreeId={worktreeId} />
					</PanelContent>
				))}
			</PanelBody>
		</Panel>
	);
}

function SessionsLoading() {
	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-border bg-muted/30 px-3 py-2">
				<Skeleton className="h-6 w-24" />
			</div>
			<div className="flex flex-1 items-center justify-center text-muted-foreground">
				<Spinner className="mr-2" />
				Loading sessions...
			</div>
		</div>
	);
}
