export type ProcKind =
	| "claude"
	| "next"
	| "vite"
	| "lazygit"
	| "git"
	| "editor"
	| "node"
	| "python"
	| "docker"
	| "shell"
	| "other";

const SHELLS = new Set(["zsh", "bash", "fish", "sh", "ksh", "dash"]);
const EDITORS = new Set(["vim", "nvim", "hx", "helix", "emacs", "nano"]);

export type ForegroundProc = { pid: number; comm: string; args: string };

export const classifyProc = (proc: ForegroundProc | null): ProcKind | null => {
	if (!proc) return null;
	const comm = proc.comm.toLowerCase();
	const args = proc.args.toLowerCase();

	if (comm === "claude" || /(^|\/| )claude( |$)/.test(args)) return "claude";
	if (comm === "lazygit") return "lazygit";
	if (EDITORS.has(comm)) return "editor";
	if (/\bnext(-server)?\b/.test(args) || / next (dev|start|build)\b/.test(args))
		return "next";
	if (/\bvite\b/.test(args)) return "vite";
	if (comm === "git") return "git";
	if (comm === "docker" || comm === "docker-compose") return "docker";
	if (comm === "python" || comm === "python3") return "python";
	if (comm === "node" || comm === "bun" || comm === "deno") return "node";
	if (SHELLS.has(comm)) return "shell";
	return "other";
};
