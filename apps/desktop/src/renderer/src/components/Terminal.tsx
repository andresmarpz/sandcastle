import "@xterm/xterm/css/xterm.css";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import {
	attachTerminal,
	detachTerminal,
	focusTerminal,
	searchTerminal,
	setTerminalTheme,
} from "../lib/terminalRegistry";

type Corners = { tl: boolean; tr: boolean; bl: boolean; br: boolean };

type TerminalProps = {
	leafId: string;
	cwd?: string;
	shell?: string;
	workspaceId?: string;
	className?: string;
	corners?: Corners;
};

function Terminal({
	leafId,
	cwd,
	shell,
	workspaceId,
	className,
	corners,
}: TerminalProps): React.JSX.Element {
	const slotRef = useRef<HTMLDivElement>(null);
	const { resolvedTheme } = useTheme();
	const mode = resolvedTheme === "light" ? "light" : "dark";

	useEffect(() => {
		setTerminalTheme(mode);
	}, [mode]);

	useEffect(() => {
		const container = slotRef.current;
		if (!container) return;
		attachTerminal(leafId, container, { cwd, shell, workspaceId });
		return () => detachTerminal(leafId, container);
	}, [leafId, cwd, shell, workspaceId]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === "f") {
			e.preventDefault();
			const term = window.prompt("Search terminal:");
			if (term) searchTerminal(leafId, term, "next");
		}
	};

	const onMouseDown = (): void => focusTerminal(leafId);

	const c = corners ?? { tl: true, tr: true, bl: true, br: true };
	const outerR = "calc(var(--radius-xl) - 1px)";
	const cornerRadii: React.CSSProperties = {
		borderTopLeftRadius: c.tl ? outerR : "0px",
		borderTopRightRadius: c.tr ? outerR : "0px",
		borderBottomLeftRadius: c.bl ? outerR : "0px",
		borderBottomRightRadius: c.br ? outerR : "0px",
	};

	return (
		<div className={`relative bg-sidebar ${className ?? "h-full w-full"}`} style={cornerRadii}>
			<div
				ref={slotRef}
				role="application"
				aria-label="Terminal"
				tabIndex={-1}
				className="absolute inset-x-2 top-2 bottom-3 overflow-hidden"
				onKeyDown={onKeyDown}
				onMouseDown={onMouseDown}
			/>
		</div>
	);
}

export default Terminal;
