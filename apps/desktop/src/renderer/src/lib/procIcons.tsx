import {
	CodeIcon,
	CubeIcon,
	GitBranchIcon,
	LightningIcon,
	type Icon as PhosphorIcon,
	SnowflakeIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";
import { ClaudeAI } from "@/components/icons/logos/Claude";
import type { ProcKind } from "@/lib/procClassifier";

export type ProcIconProps = { size: number; className?: string };

export type ProcVisual = {
	label: string;
	/**
	 * Icon color. Tailwind class. Applied to the chip's text/currentColor so
	 * Phosphor glyphs and letter chips pick it up.
	 */
	fg: string;
	/** Icon rendered inside the chip. */
	Icon: React.ComponentType<ProcIconProps>;
	/**
	 * If true, the icon fills the chip edge-to-edge (use for brand marks that
	 * already have their own shape/color). Otherwise the icon is centered at
	 * ~75% of the chip size.
	 */
	fill?: boolean;
};

const Letter =
	(ch: string): React.ComponentType<ProcIconProps> =>
	({ size, className }) => (
		<span className={className} style={{ fontWeight: 700, lineHeight: 1, fontSize: size }}>
			{ch}
		</span>
	);

const phosphor =
	(
		Component: PhosphorIcon,
		weight: "regular" | "bold" | "fill" = "bold",
	): React.ComponentType<ProcIconProps> =>
	({ size }) => <Component size={size} weight={weight} />;

const claude: React.ComponentType<ProcIconProps> = ({ size }) => (
	<ClaudeAI width={size} height={size} />
);

const VISUALS: Partial<Record<ProcKind, ProcVisual>> = {
	claude: { label: "Claude", fg: "", Icon: claude, fill: true },
	next: { label: "Next.js", fg: "text-foreground", Icon: Letter("N") },
	vite: { label: "Vite", fg: "text-violet-500", Icon: phosphor(LightningIcon, "fill") },
	lazygit: { label: "Lazygit", fg: "text-emerald-600", Icon: Letter("L") },
	git: { label: "git", fg: "text-amber-600", Icon: phosphor(GitBranchIcon) },
	editor: { label: "Editor", fg: "text-sky-600", Icon: phosphor(CodeIcon) },
	node: { label: "Node", fg: "text-green-600", Icon: Letter("N") },
	python: { label: "Python", fg: "text-blue-600", Icon: phosphor(SnowflakeIcon) },
	docker: { label: "Docker", fg: "text-blue-500", Icon: phosphor(CubeIcon) },
	shell: {
		label: "Shell",
		fg: "text-muted-foreground",
		Icon: phosphor(TerminalWindowIcon, "regular"),
	},
};

export const visualFor = (kind: ProcKind | null): ProcVisual | null => {
	if (!kind || kind === "other") return null;
	return VISUALS[kind] ?? null;
};
