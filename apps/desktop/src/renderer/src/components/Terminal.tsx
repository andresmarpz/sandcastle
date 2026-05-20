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

function Terminal({ leafId, cwd, shell, className, corners }: TerminalProps): React.JSX.Element {
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

	const ringClass = focused
		? mode === "light"
			? "ring-1 ring-inset ring-neutral-400/70"
			: "ring-1 ring-inset ring-neutral-500/70"
		: "";

	const c = corners ?? { tl: true, tr: true, bl: true, br: true };

	return (
		<div
			data-corner-tl={c.tl ? "" : undefined}
			data-corner-tr={c.tr ? "" : undefined}
			data-corner-bl={c.bl ? "" : undefined}
			data-corner-br={c.br ? "" : undefined}
			className={`${className ?? "h-full w-full"} overflow-hidden data-[corner-tl]:rounded-tl-xl data-[corner-tr]:rounded-tr-xl data-[corner-bl]:rounded-bl-xl data-[corner-br]:rounded-br-xl ${ringClass}`}
			style={{ backgroundColor: mode === "light" ? "#ffffff" : "#0a0a0a" }}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
		>
			<div
				ref={slotRef}
				className="h-full w-full overflow-hidden"
				onKeyDown={onKeyDown}
				onMouseDown={onMouseDown}
			/>
		</div>
	);
}

export default Terminal;
