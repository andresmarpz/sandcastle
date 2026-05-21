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
type Edges = { t: boolean; r: boolean; b: boolean; l: boolean };

type TerminalProps = {
	leafId: string;
	cwd?: string;
	shell?: string;
	className?: string;
	corners?: Corners;
	edges?: Edges;
};

function Terminal({
	leafId,
	cwd,
	shell,
	className,
	corners,
	edges,
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

	const borderColorClass = focused
		? mode === "light"
			? "border-neutral-400/70"
			: "border-neutral-500/70"
		: "border-border";

	const e = edges ?? { t: true, r: true, b: true, l: true };
	const edgeWidths = [
		e.t ? "border-t" : "",
		e.r ? "border-r" : "",
		e.b ? "border-b" : "",
		e.l ? "border-l" : "",
	]
		.filter(Boolean)
		.join(" ");

	const bgColor = mode === "light" ? "#ffffff" : "#0a0a0a";
	const focusShadowColor = mode === "light" ? "rgb(163 163 163 / 0.7)" : "rgb(115 115 115 / 0.7)";
	const c = corners ?? { tl: true, tr: true, bl: true, br: true };

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: focus state wrapper for an xterm terminal
		<div
			data-focused={focused ? "true" : undefined}
			data-corner-tl={c.tl ? "" : undefined}
			data-corner-tr={c.tr ? "" : undefined}
			data-corner-bl={c.bl ? "" : undefined}
			data-corner-br={c.br ? "" : undefined}
			className={`relative ${className ?? "h-full w-full"} ${edgeWidths} ${borderColorClass} overflow-hidden data-[corner-tl]:rounded-tl-xl data-[corner-tr]:rounded-tr-xl data-[corner-bl]:rounded-bl-xl data-[corner-br]:rounded-br-xl`}
			style={{
				backgroundColor: bgColor,
				boxShadow: focused ? `0 0 0 1px ${focusShadowColor}` : undefined,
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
		</div>
	);
}

export default Terminal;
