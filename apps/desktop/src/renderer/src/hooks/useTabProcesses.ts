import { useEffect, useState } from "react";

import { collectLeafIds, type Pane } from "@/lib/paneTree";
import { pickProcKind, type ProcKind } from "@/lib/procClassifier";
import { getSessionId, subscribeStats } from "@/lib/terminalRegistry";

export type LeafProc = {
	leafId: string;
	kind: ProcKind | null;
	comm: string | null;
};

type Options = {
	tree: Pane;
	// Active tabs poll faster than background tabs. The polling interval is
	// already short enough that the cost is negligible (one `ps` call per tick
	// regardless of pane count, since the IPC batches all sessions together).
	intervalMs?: number;
	enabled?: boolean;
};

export const useTabProcesses = ({
	tree,
	intervalMs = 1500,
	enabled = true,
}: Options): LeafProc[] => {
	const [procs, setProcs] = useState<LeafProc[]>([]);

	useEffect(() => {
		if (!enabled) {
			setProcs([]);
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let inFlight = false;

		const tick = async (): Promise<void> => {
			if (cancelled || inFlight) return;
			inFlight = true;
			try {
				const leafIds = collectLeafIds(tree);
				const sessions: Array<{ leafId: string; sessionId: string }> = [];
				for (const leafId of leafIds) {
					const sid = getSessionId(leafId);
					if (sid) sessions.push({ leafId, sessionId: sid });
				}
				if (sessions.length === 0) {
					if (!cancelled) setProcs([]);
				} else {
					const byId = await window.api.terminal.getForegroundProcs(
						sessions.map((s) => s.sessionId),
					);
					if (cancelled) return;
					const next: LeafProc[] = sessions.map(({ leafId, sessionId }) => {
						const picked = pickProcKind(byId[sessionId] ?? []);
						return {
							leafId,
							kind: picked?.kind ?? null,
							comm: picked?.comm ?? null,
						};
					});
					setProcs(next);
				}
			} catch {
				// Swallow — keep last good state, retry next tick.
			} finally {
				inFlight = false;
				if (!cancelled) timer = setTimeout(tick, intervalMs);
			}
		};

		// Re-tick when terminals attach/detach so panes light up without
		// waiting a full interval.
		const unsubStats = subscribeStats(() => {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			void tick();
		});

		void tick();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			unsubStats();
		};
	}, [tree, intervalMs, enabled]);

	return procs;
};
