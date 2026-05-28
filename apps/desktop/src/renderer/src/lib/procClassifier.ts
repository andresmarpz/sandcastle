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

	// Match a bare `claude` comm, or "claude" as a path segment / argv token:
	// the launcher shows up as `…/.local/bin/claude` and the real binary as
	// `…/share/claude/versions/2.1.150 …` (comm becomes the version number, so
	// comm alone misses it). Requiring a leading space or `/` avoids matching
	// `.claude` (the `~/.claude/...` resume paths every invocation carries, and
	// unrelated commands that merely touch a dotfile under it).
	if (comm === "claude" || /(?:^|[\s/])claude(?:[\s/]|$)/.test(args)) return "claude";
	if (comm === "lazygit") return "lazygit";
	if (EDITORS.has(comm)) return "editor";
	if (/\bnext(-server)?\b/.test(args) || / next (dev|start|build)\b/.test(args)) return "next";
	if (/\bvite\b/.test(args)) return "vite";
	if (comm === "git") return "git";
	if (comm === "docker" || comm === "docker-compose") return "docker";
	if (comm === "python" || comm === "python3") return "python";
	if (comm === "node" || comm === "bun" || comm === "deno") return "node";
	if (SHELLS.has(comm)) return "shell";
	return "other";
};

// How "interesting" each kind is to show on a tab. The job the user actually
// launched (claude, a dev server, an editor, lazygit) outranks the helper
// processes it spawns — a shell, ripgrep, esbuild, git — which all share the
// same foreground process group and so all turn up in the candidate list.
const KIND_PRIORITY: Record<ProcKind, number> = {
	claude: 100,
	lazygit: 90,
	editor: 90,
	next: 80,
	vite: 80,
	docker: 70,
	python: 60,
	node: 40,
	git: 30,
	shell: 10,
	other: 0,
};

// Pick the most meaningful process out of a terminal's foreground process
// group. Choosing by priority (rather than by process-tree depth) is what makes
// the tab icon stable: while `claude` runs a tool it briefly spawns a shell and
// ripgrep, but claude still outranks them so the icon never flickers; a Vite
// server stays "Vite" even though its deepest child is esbuild. `procs` arrives
// deepest-first, so ties within a tier resolve to the innermost process (e.g.
// the real server beneath its npm/turbo wrappers).
export const pickProcKind = (
	procs: ForegroundProc[],
): { kind: ProcKind; comm: string } | null => {
	let best: { kind: ProcKind; comm: string; prio: number } | null = null;
	for (const proc of procs) {
		const kind = classifyProc(proc);
		if (!kind) continue;
		const prio = KIND_PRIORITY[kind];
		if (!best || prio > best.prio) best = { kind, comm: proc.comm, prio };
	}
	return best ? { kind: best.kind, comm: best.comm } : null;
};
