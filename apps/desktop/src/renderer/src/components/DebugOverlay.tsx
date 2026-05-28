import { useEffect, useRef, useState } from "react";
import { getStats, subscribeStats, type TerminalStat } from "../lib/terminalRegistry";

type PerformanceWithMemory = Performance & {
	memory?: {
		usedJSHeapSize: number;
		totalJSHeapSize: number;
		jsHeapSizeLimit: number;
	};
};

const formatMB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

function DebugOverlay(): React.JSX.Element | null {
	const [collapsed, setCollapsed] = useState(false);
	const [fps, setFps] = useState(0);
	const [stats, setStats] = useState<TerminalStat[]>(getStats());
	const [heap, setHeap] = useState<{ used: number; total: number; limit: number } | null>(null);

	const framesRef = useRef(0);
	const lastTickRef = useRef(performance.now());

	useEffect(() => {
		let raf = 0;
		const loop = (): void => {
			framesRef.current += 1;
			const now = performance.now();
			const dt = now - lastTickRef.current;
			if (dt >= 500) {
				setFps(Math.round((framesRef.current * 1000) / dt));
				framesRef.current = 0;
				lastTickRef.current = now;
				const mem = (performance as PerformanceWithMemory).memory;
				if (mem) {
					setHeap({
						used: mem.usedJSHeapSize,
						total: mem.totalJSHeapSize,
						limit: mem.jsHeapSizeLimit,
					});
				}
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, []);

	useEffect(() => {
		const refresh = (): void => setStats(getStats());
		const unsub = subscribeStats(refresh);
		// Also re-poll cols/rows on a slow interval since resize doesn't notify.
		const interval = setInterval(refresh, 1000);
		return () => {
			unsub();
			clearInterval(interval);
		};
	}, []);

	const fpsColor = fps >= 55 ? "text-emerald-400" : fps >= 30 ? "text-amber-400" : "text-red-400";

	return (
		<div className="no-drag pointer-events-auto fixed right-2 bottom-2 z-50 select-none font-mono text-[10px] text-white/80">
			<div className="rounded-md border border-white/10 bg-black/70 shadow-lg backdrop-blur-sm">
				<button
					type="button"
					onClick={() => setCollapsed((c) => !c)}
					className="flex w-full items-center justify-between gap-2 px-2 py-1 hover:bg-white/5"
				>
					<span className="text-white/60">debug</span>
					<span className={fpsColor}>{fps} fps</span>
				</button>
				{!collapsed && (
					<div className="space-y-1 border-t border-white/10 px-2 py-1.5">
						<Row label="terminals" value={String(stats.length)} />
						{heap && (
							<Row label="heap" value={`${formatMB(heap.used)} / ${formatMB(heap.total)}`} />
						)}
						{stats.length > 0 && (
							<div className="space-y-0.5 pt-1">
								{stats.map((s) => (
									<div key={s.leafId} className="flex items-center justify-between gap-2">
										<span className="truncate text-white/50">{s.leafId}</span>
										<span className="flex items-center gap-1.5">
											<RendererBadge type={s.rendererType} />
											<span className="text-white/40">
												{s.cols}×{s.rows}
											</span>
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-white/50">{label}</span>
			<span>{value}</span>
		</div>
	);
}

function RendererBadge({ type }: { type: "webgl" | "canvas" | "dom" }): React.JSX.Element {
	const styles =
		type === "webgl"
			? "bg-emerald-500/20 text-emerald-300"
			: type === "canvas"
				? "bg-amber-500/20 text-amber-300"
				: "bg-red-500/20 text-red-300";
	return (
		<span className={`rounded px-1 py-px text-[9px] uppercase tracking-wide ${styles}`}>
			{type}
		</span>
	);
}

export default DebugOverlay;
