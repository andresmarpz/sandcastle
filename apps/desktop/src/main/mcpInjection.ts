import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import process from "node:process";

/**
 * How a `claude` launched inside a Sandcastle terminal is wired to drive the app,
 * WITHOUT patching the user's global ~/.claude config and WITHOUT affecting claude
 * run outside Sandcastle.
 *
 * Mechanism: a `claude` shell FUNCTION (not a PATH shim). A function resolves
 * before any PATH lookup, so it survives the user's rc rebuilding PATH every
 * prompt (e.g. `direnv hook`) — which defeats a PATH-prepended shim. The function
 * re-execs `command claude` with three flags:
 *   --settings <ours>              an EXTRA settings file with only our worktree
 *                                  hook (Claude MERGES it on top of the user's
 *                                  settings — verified — so we never touch theirs)
 *   --mcp-config <ours>            connects the in-process "sandcastle" MCP server
 *   --append-system-prompt-file    tells the model about the sandcastle_* tools
 *
 * Delivery is per-shell, activated purely by the per-PTY env Sandcastle controls,
 * so it is a no-op in the user's normal terminals:
 *   zsh  — ZDOTDIR points at our dir (+ SANDCASTLE_REAL_ZDOTDIR to source theirs)
 *   fish — XDG_CONFIG_HOME points at our dir (+ SANDCASTLE_REAL_FISH_CONFIG)
 *   bash — a `--rcfile` arg (interactive bash ignores env-based rc hooks)
 */

export type InjectionAssets = {
	dir: string;
	mcpConfigPath: string;
	sysPromptPath: string;
	settingsPath: string;
	hookScriptPath: string;
	zshDir: string;
	fishXdgDir: string;
	bashRcPath: string;
};

const shQuote = (p: string): string => `'${p.replace(/'/g, "'\\''")}'`;

const MCP_CONFIG = (): string =>
	`${JSON.stringify(
		{
			mcpServers: {
				sandcastle: {
					type: "http",
					// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${VAR}, expanded by Claude Code from env — not a JS template.
					url: "${SANDCASTLE_MCP_URL}/mcp",
					// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${VAR}, expanded by Claude Code from env — not a JS template.
					headers: { Authorization: "Bearer ${SANDCASTLE_MCP_TOKEN}" },
				},
			},
		},
		null,
		2,
	)}\n`;

// Minimal EXTRA settings — ONLY our worktree hook. Claude merges hook arrays
// per-event across sources, so this ADDS to the user's hooks without replacing
// them. Scoped to the `hooks` key only (scalar prefs are last-writer-wins).
const SETTINGS = (hookScriptPath: string): string => {
	const command = shQuote(hookScriptPath);
	return `${JSON.stringify(
		{
			hooks: {
				PostToolUse: [
					{ matcher: "EnterWorktree|ExitWorktree", hooks: [{ type: "command", command }] },
				],
				CwdChanged: [{ hooks: [{ type: "command", command }] }],
			},
		},
		null,
		2,
	)}\n`;
};

const SYSTEM_PROMPT = `You are running inside a Sandcastle terminal pane. Sandcastle is a terminal app that groups terminals into Projects and Workspaces (one Workspace per git worktree). A native MCP server named "sandcastle" is connected — use its tools so the UI follows your work instead of describing UI actions in prose:

- Entering a git worktree re-groups this terminal under the matching workspace automatically. Call \`sandcastle_teleport_worktree\` only to force re-grouping to a specific path.
- Use \`sandcastle_split_pane\` to split the current pane and \`sandcastle_new_tab\` to open a new terminal tab when organizing parallel work.
- Call \`sandcastle_whoami\` to read your current workspace / tab / pane context.
`;

// Best-effort, fast, never blocks. Posts the raw hook JSON to our loopback server,
// which reads the cwd. No-op outside a Sandcastle terminal.
const HOOK_SCRIPT = `#!/bin/sh
[ -z "$SANDCASTLE_MCP_URL" ] && exit 0
[ -z "$SANDCASTLE_SESSION_ID" ] && exit 0
input="$(cat)"
[ -z "$input" ] && exit 0
printf '%s' "$input" | curl -s -m 2 -X POST "$SANDCASTLE_MCP_URL/hook/teleport" \\
  -H "Authorization: Bearer $SANDCASTLE_MCP_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data-binary @- >/dev/null 2>&1 || true
exit 0
`;

// POSIX-sh `claude` function body. `command claude` bypasses this function (no
// recursion) and resolves the real binary via PATH. Guarded so it degrades to a
// plain claude if the env is somehow absent.
const SH_CLAUDE_FUNCTION = `claude() {
  if [ -n "$SANDCASTLE_SETTINGS" ]; then
    command claude --settings "$SANDCASTLE_SETTINGS" --mcp-config "$SANDCASTLE_MCP_CONFIG" --append-system-prompt-file "$SANDCASTLE_SYS_PROMPT" "$@"
  else
    command claude "$@"
  fi
}`;

// zsh: source the user's real dotfile for each startup stage (via the side var,
// NEVER reassigning ZDOTDIR — zsh re-reads it each stage and would then load the
// user's dir instead of ours), then (.zshrc only) define the function LAST.
const zshFile = (realFileName: string, withFunction: boolean): string => {
	const src = `_SC_REAL="\${SANDCASTLE_REAL_ZDOTDIR:-$HOME}"\n[ -f "$_SC_REAL/${realFileName}" ] && . "$_SC_REAL/${realFileName}"\n`;
	return withFunction ? `${src}\n${SH_CLAUDE_FUNCTION}\n` : src;
};

const BASH_RCFILE = `[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"\n\n${SH_CLAUDE_FUNCTION}\n`;

const FISH_CONF = `if test -d "$SANDCASTLE_REAL_FISH_CONFIG"
    for f in $SANDCASTLE_REAL_FISH_CONFIG/conf.d/*.fish
        test -f $f; and source $f
    end
    test -f "$SANDCASTLE_REAL_FISH_CONFIG/config.fish"; and source "$SANDCASTLE_REAL_FISH_CONFIG/config.fish"
end

function claude
    if test -n "$SANDCASTLE_SETTINGS"
        command claude --settings $SANDCASTLE_SETTINGS --mcp-config $SANDCASTLE_MCP_CONFIG --append-system-prompt-file $SANDCASTLE_SYS_PROMPT $argv
    else
        command claude $argv
    end
end
`;

/**
 * Write the shared (per-app, not per-session) injection assets. Idempotent —
 * safe to call on every launch.
 */
export const writeInjectionAssets = async (dir: string): Promise<InjectionAssets> => {
	const mcpConfigPath = join(dir, "mcp-config.json");
	const sysPromptPath = join(dir, "system-prompt.md");
	const settingsPath = join(dir, "settings.json");
	const hookScriptPath = join(dir, "worktree-hook.sh");
	const zshDir = join(dir, "shell", "zsh");
	const fishXdgDir = join(dir, "shell", "fishxdg");
	const fishConfDir = join(fishXdgDir, "fish", "conf.d");
	const bashDir = join(dir, "shell", "bash");
	const bashRcPath = join(bashDir, "rcfile");

	await Promise.all([
		fs.mkdir(dir, { recursive: true }),
		fs.mkdir(zshDir, { recursive: true }),
		fs.mkdir(fishConfDir, { recursive: true }),
		fs.mkdir(bashDir, { recursive: true }),
	]);

	await Promise.all([
		fs.writeFile(mcpConfigPath, MCP_CONFIG()),
		fs.writeFile(sysPromptPath, SYSTEM_PROMPT),
		fs.writeFile(settingsPath, SETTINGS(hookScriptPath)),
		fs.writeFile(hookScriptPath, HOOK_SCRIPT, { mode: 0o755 }),
		fs.writeFile(join(zshDir, ".zshenv"), zshFile(".zshenv", false)),
		fs.writeFile(join(zshDir, ".zprofile"), zshFile(".zprofile", false)),
		fs.writeFile(join(zshDir, ".zlogin"), zshFile(".zlogin", false)),
		fs.writeFile(join(zshDir, ".zshrc"), zshFile(".zshrc", true)),
		fs.writeFile(join(fishConfDir, "00-sandcastle.fish"), FISH_CONF),
		fs.writeFile(bashRcPath, BASH_RCFILE),
	]);
	await fs.chmod(hookScriptPath, 0o755).catch(() => {});

	return {
		dir,
		mcpConfigPath,
		sysPromptPath,
		settingsPath,
		hookScriptPath,
		zshDir,
		fishXdgDir,
		bashRcPath,
	};
};

/**
 * Per-session SANDCASTLE_* env, read by the worktree hook and the `claude`
 * function (and the env-expanded MCP config).
 */
export const sessionEnv = (opts: {
	assets: InjectionAssets;
	sessionId: string;
	workspaceId?: string;
	token: string;
	mcpBaseUrl: string;
}): Record<string, string> => {
	const env: Record<string, string> = {
		SANDCASTLE_SESSION_ID: opts.sessionId,
		SANDCASTLE_MCP_URL: opts.mcpBaseUrl,
		SANDCASTLE_MCP_TOKEN: opts.token,
		SANDCASTLE_MCP_CONFIG: opts.assets.mcpConfigPath,
		SANDCASTLE_SYS_PROMPT: opts.assets.sysPromptPath,
		SANDCASTLE_SETTINGS: opts.assets.settingsPath,
	};
	if (opts.workspaceId) env.SANDCASTLE_WORKSPACE_ID = opts.workspaceId;
	return env;
};

/**
 * Shell-specific env + spawn args that activate the `claude` function for the
 * PTY's shell. Returns empty for unknown shells (graceful: no injection).
 */
export const shellInjection = (
	shell: string,
	assets: InjectionAssets,
): { env: Record<string, string>; args: string[] } => {
	const name = basename(shell).toLowerCase();
	if (name.includes("zsh")) {
		return {
			env: { ZDOTDIR: assets.zshDir, SANDCASTLE_REAL_ZDOTDIR: process.env.ZDOTDIR || homedir() },
			args: [],
		};
	}
	if (name.includes("fish")) {
		const realFish = process.env.XDG_CONFIG_HOME
			? join(process.env.XDG_CONFIG_HOME, "fish")
			: join(homedir(), ".config", "fish");
		return {
			env: { XDG_CONFIG_HOME: assets.fishXdgDir, SANDCASTLE_REAL_FISH_CONFIG: realFish },
			args: [],
		};
	}
	if (name.includes("bash")) {
		return { env: {}, args: ["--rcfile", assets.bashRcPath] };
	}
	return { env: {}, args: [] };
};
