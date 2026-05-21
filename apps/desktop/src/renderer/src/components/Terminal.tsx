import "@xterm/xterm/css/xterm.css";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
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
	className?: string;
	corners?: Corners;
};

function Terminal({
	leafId,
	cwd,
	shell,
	className,
	corners,
}: TerminalProps): React.JSX.Element {
	const slotRef = useRef<HTMLDivElement>(null);
	const [focused, setFocused] = useState(false);
	const { resolvedTheme } = useTheme();
	const mode = resolvedTheme === "light" ? "light" : "dark";

	useEffect(() => {
		setTerminalTheme(mode);
	}, [mode]);

	useEffect(() => {
		const container = slotRef.current;
		if (!container) return;
		attachTerminal(leafId, container, { cwd, shell });
		return () => detachTerminal(leafId, container);
	}, [leafId, cwd, shell]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === "f") {
			e.preventDefault();
			const term = window.prompt("Search terminal:");
			if (term) searchTerminal(leafId, term, "next");
		}
	};

	const onMouseDown = (): void => focusTerminal(leafId);

	const focusRingColor = mode === "light" ? "rgb(59 130 246 / 0.8)" : "rgb(96 165 250 / 0.8)";
	const c = corners ?? { tl: true, tr: true, bl: true, br: true };
	// Match SidebarInset's inner curve (outer radius minus its 1px border) so
	// the focus ring traces the inset edge cleanly. Only round corners that
	// actually touch the inset; inner pane edges stay square.
	const outerR = "calc(var(--radius-xl) - 1px)";
	const cornerRadii: React.CSSProperties = {
		borderTopLeftRadius: c.tl ? outerR : "0px",
		borderTopRightRadius: c.tr ? outerR : "0px",
		borderBottomLeftRadius: c.bl ? outerR : "0px",
		borderBottomRightRadius: c.br ? outerR : "0px",
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: focus state wrapper for an xterm terminal
		<div
			data-focused={focused ? "true" : undefined}
			className={`relative bg-sidebar ${className ?? "h-full w-full"}`}
			style={{
				...cornerRadii,
				zIndex: focused ? 2 : undefined,
			}}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
		>
			<div
				ref={slotRef}
				role="application"
				aria-label="Terminal"
				tabIndex={-1}
				className="absolute inset-x-2 top-2 bottom-3 overflow-hidden"
				onKeyDown={onKeyDown}
				onMouseDown={onMouseDown}
			/>
			{focused ? (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 box-border border-[1.5px]"
					style={{ ...cornerRadii, borderColor: focusRingColor }}
				/>
			) : null}
		</div>
	);
}

export default Terminal;
