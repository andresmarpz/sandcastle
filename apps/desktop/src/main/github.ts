import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Context, Effect, Layer, ManagedRuntime, Semaphore } from "effect";
import { ipcMain } from "electron";
import { userEnvReady } from "./userEnv";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Wire types — the single source of truth for the PR status shape. The preload
// annotates its `github.prStatus` return with `PrStatus`, so the renderer
// derives the exact same type from `window.api` without importing main code.
// ---------------------------------------------------------------------------

/** Overall PR lifecycle, collapsed to the states the sidebar icon distinguishes. */
export type PrState = "open" | "draft" | "merged" | "closed";

/** Aggregate CI verdict across every check/status attached to the head commit. */
export type PrCiStatus = "passing" | "failing" | "pending" | "none";

export type PrReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface PrStatus {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly state: PrState;
	readonly isDraft: boolean;
	readonly ci: PrCiStatus;
	readonly checks: {
		readonly total: number;
		readonly passed: number;
		readonly failed: number;
		readonly pending: number;
	};
	readonly reviewDecision: PrReviewDecision;
	readonly headRefName: string;
	readonly baseRefName: string;
	readonly author: string | null;
	readonly additions: number;
	readonly deletions: number;
	readonly updatedAt: string;
}

export interface PrStatusInput {
	/** Absolute path to the worktree; `gh` infers repo + branch from its cwd. */
	readonly repoPath: string;
	/** The worktree's branch — carried for cache keying/clarity, not passed to `gh`. */
	readonly branch: string;
}

// ---------------------------------------------------------------------------
// gh invocation
// ---------------------------------------------------------------------------

// `gh pr view` (no positional arg) resolves the PR for the cwd's current branch
// via its tracking config — more robust than passing a local branch name that
// may differ from the pushed head ref.
const GH_FIELDS = [
	"number",
	"title",
	"url",
	"state",
	"isDraft",
	"headRefName",
	"baseRefName",
	"reviewDecision",
	"author",
	"additions",
	"deletions",
	"statusCheckRollup",
	"updatedAt",
].join(",");

const GH_TIMEOUT_MS = 8_000;
const GH_MAX_BUFFER = 4 * 1024 * 1024;

interface GhCheck {
	readonly __typename?: string;
	readonly status?: string; // CheckRun: COMPLETED | IN_PROGRESS | QUEUED | ...
	readonly conclusion?: string; // CheckRun: SUCCESS | FAILURE | NEUTRAL | ...
	readonly state?: string; // StatusContext: SUCCESS | FAILURE | PENDING | ERROR | ...
}

const PASS_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAIL_CONCLUSIONS = new Set([
	"FAILURE",
	"TIMED_OUT",
	"CANCELLED",
	"ACTION_REQUIRED",
	"STARTUP_FAILURE",
	"STALE",
]);

const classifyCheck = (check: GhCheck): "pass" | "fail" | "pending" => {
	// StatusContext (legacy commit statuses) report via `state`.
	if (check.state) {
		const state = check.state.toUpperCase();
		if (state === "SUCCESS") return "pass";
		if (state === "FAILURE" || state === "ERROR") return "fail";
		return "pending"; // PENDING | EXPECTED
	}
	// CheckRun (GitHub Actions, apps) report via `status` + `conclusion`.
	if ((check.status ?? "").toUpperCase() !== "COMPLETED") return "pending";
	const conclusion = (check.conclusion ?? "").toUpperCase();
	if (PASS_CONCLUSIONS.has(conclusion)) return "pass";
	if (FAIL_CONCLUSIONS.has(conclusion)) return "fail";
	return "pending";
};

const deriveState = (rawState: string, isDraft: boolean): PrState => {
	const state = rawState.toUpperCase();
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	return isDraft ? "draft" : "open";
};

const parseReviewDecision = (raw: unknown): PrReviewDecision => {
	if (raw === "APPROVED" || raw === "CHANGES_REQUESTED" || raw === "REVIEW_REQUIRED") return raw;
	return null;
};

const toPrStatus = (raw: Record<string, unknown>): PrStatus => {
	const rollup = Array.isArray(raw.statusCheckRollup) ? (raw.statusCheckRollup as GhCheck[]) : [];
	let passed = 0;
	let failed = 0;
	let pending = 0;
	for (const check of rollup) {
		const verdict = classifyCheck(check);
		if (verdict === "pass") passed += 1;
		else if (verdict === "fail") failed += 1;
		else pending += 1;
	}
	const total = rollup.length;
	const ci: PrCiStatus =
		total === 0 ? "none" : failed > 0 ? "failing" : pending > 0 ? "pending" : "passing";

	const isDraft = raw.isDraft === true;
	const author = raw.author as { login?: string } | null | undefined;

	return {
		number: typeof raw.number === "number" ? raw.number : 0,
		title: typeof raw.title === "string" ? raw.title : "",
		url: typeof raw.url === "string" ? raw.url : "",
		state: deriveState(typeof raw.state === "string" ? raw.state : "", isDraft),
		isDraft,
		ci,
		checks: { total, passed, failed, pending },
		reviewDecision: parseReviewDecision(raw.reviewDecision),
		headRefName: typeof raw.headRefName === "string" ? raw.headRefName : "",
		baseRefName: typeof raw.baseRefName === "string" ? raw.baseRefName : "",
		author: author?.login ?? null,
		additions: typeof raw.additions === "number" ? raw.additions : 0,
		deletions: typeof raw.deletions === "number" ? raw.deletions : 0,
		updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
	};
};

// ---------------------------------------------------------------------------
// Multi-account resolution
//
// `gh` only ever has ONE active account, but a user can be logged into several
// (e.g. a personal account plus a work account). A worktree whose remote lives
// under an org that only the *inactive* account can see would otherwise show no
// badge at all. `gh pr view` has no per-invocation `--account` flag, but `gh`
// honors the `GH_TOKEN` env var per-process — so we hand each spawn the token of
// whichever account can actually see that repo, with no global `gh auth switch`
// (which is stateful and would race across the concurrent sidebar queries).
//
// We discover the owning account once per repo by probing accounts (active
// first) and watching which one `gh` accepts, then cache that mapping so the
// steady state is a single spawn with the right token.
// ---------------------------------------------------------------------------

const GH_AUTH_TTL_MS = 5 * 60_000; // re-read accounts/tokens so add/remove/rotate recovers.
const RESOLVE_NONE_TTL_MS = 10 * 60_000; // re-probe repos no account could see; access may be granted later.

// `gh` prints "no pull requests found …" only when the repo IS reachable by the
// account — auth succeeded, there just isn't a PR for the branch. Every other
// failure (401, "could not resolve to a Repository", gh missing, timeout) means
// this account can't speak for the repo, so we move on to the next one.
const REPO_VISIBLE_NO_PR = /no (?:open )?pull requests? found/i;

const cachedAsync = <T>(ttlMs: number, load: () => Promise<T>): (() => Promise<T>) => {
	let entry: { value: T; at: number } | null = null;
	return async () => {
		const now = Date.now();
		if (entry && now - entry.at < ttlMs) return entry.value;
		const value = await load();
		entry = { value, at: now };
		return value;
	};
};

// Logged-in github.com accounts, active account first. Parsed from `gh auth
// status` (English-only output, written to both streams). Empty when gh is
// absent or no account is logged in.
const getAccounts = cachedAsync(GH_AUTH_TTL_MS, async (): Promise<string[]> => {
	try {
		const { stdout, stderr } = await execFileAsync("gh", ["auth", "status"], {
			timeout: GH_TIMEOUT_MS,
			maxBuffer: GH_MAX_BUFFER,
		});
		const blocks = `${stdout}\n${stderr}`.split(/Logged in to \S+ account /).slice(1);
		const accounts: { login: string; active: boolean }[] = [];
		for (const block of blocks) {
			const login = block.match(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/)?.[0];
			if (!login || accounts.some((a) => a.login === login)) continue;
			accounts.push({ login, active: /Active account:\s*true/.test(block) });
		}
		accounts.sort((a, b) => Number(b.active) - Number(a.active));
		return accounts.map((a) => a.login);
	} catch {
		return [];
	}
});

// Per-account token, cached briefly so a rotated/refreshed token recovers.
const tokenCache = new Map<string, { token: string; at: number }>();
const tokenFor = async (login: string): Promise<string | null> => {
	const now = Date.now();
	const cached = tokenCache.get(login);
	if (cached && now - cached.at < GH_AUTH_TTL_MS) return cached.token;
	try {
		const { stdout } = await execFileAsync("gh", ["auth", "token", "--user", login], {
			timeout: GH_TIMEOUT_MS,
			maxBuffer: GH_MAX_BUFFER,
		});
		const token = stdout.trim();
		if (!token) return null;
		tokenCache.set(login, { token, at: now });
		return token;
	} catch {
		return null;
	}
};

type ProbeResult =
	| { readonly kind: "found"; readonly pr: PrStatus }
	| { readonly kind: "visible" } // repo reachable by this account, no PR for the branch
	| { readonly kind: "inconclusive" }; // this account can't speak for the repo

const probePr = async (
	repoPath: string,
	token: string | undefined,
	signal: AbortSignal,
): Promise<ProbeResult> => {
	try {
		const { stdout } = await execFileAsync("gh", ["pr", "view", "--json", GH_FIELDS], {
			cwd: repoPath,
			timeout: GH_TIMEOUT_MS,
			maxBuffer: GH_MAX_BUFFER,
			signal,
			env: token ? { ...process.env, GH_TOKEN: token } : process.env,
		});
		return { kind: "found", pr: toPrStatus(JSON.parse(stdout) as Record<string, unknown>) };
	} catch (error) {
		const stderr = String((error as { stderr?: unknown })?.stderr ?? "");
		return REPO_VISIBLE_NO_PR.test(stderr) ? { kind: "visible" } : { kind: "inconclusive" };
	}
};

// repoPath -> the account login that can see it (null once we've learned that
// none of the logged-in accounts can). Non-null entries are sticky; null
// entries go stale after RESOLVE_NONE_TTL_MS so newly granted access recovers.
const resolvedAccount = new Map<string, { login: string | null; at: number }>();

const resolvePrStatus = async (repoPath: string, signal: AbortSignal): Promise<PrStatus | null> => {
	const accounts = await getAccounts();

	// One account, or the user pinned a token via the environment: behave exactly
	// as before — a single probe with the ambient gh auth, no GH_TOKEN plumbing.
	const envPinned = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
	if (envPinned || accounts.length <= 1) {
		const result = await probePr(repoPath, undefined, signal);
		return result.kind === "found" ? result.pr : null;
	}

	const known = resolvedAccount.get(repoPath);
	if (known?.login === null && Date.now() - known.at < RESOLVE_NONE_TTL_MS) return null;

	// Try the previously resolved account first, then the rest (active-first), so
	// a known repo is a single spawn while a token that lost access self-heals.
	const knownLogin = known?.login ?? null;
	const order = knownLogin
		? [knownLogin, ...accounts.filter((login) => login !== knownLogin)]
		: accounts;

	for (const login of order) {
		const token = await tokenFor(login);
		if (!token) continue;
		const result = await probePr(repoPath, token, signal);
		if (result.kind === "found") {
			resolvedAccount.set(repoPath, { login, at: Date.now() });
			return result.pr;
		}
		if (result.kind === "visible") {
			resolvedAccount.set(repoPath, { login, at: Date.now() });
			return null;
		}
	}

	resolvedAccount.set(repoPath, { login: null, at: Date.now() });
	return null;
};

// ---------------------------------------------------------------------------
// Effect service
// ---------------------------------------------------------------------------

export interface GitHubServiceShape {
	/**
	 * Resolve the PR for a worktree by shelling out to `gh`. Never fails: a
	 * missing PR, an unauthenticated/absent `gh`, or any other error all resolve
	 * to `null` so the renderer simply shows no icon.
	 */
	readonly prStatus: (input: PrStatusInput) => Effect.Effect<PrStatus | null>;
}

export class GitHubService extends Context.Service<GitHubService, GitHubServiceShape>()(
	"@sandcastle/desktop/GitHubService",
) {}

// Cap how many `gh` processes we spawn at once. Sidebars with many worktrees
// would otherwise fork a child per row on first paint / window focus.
const MAX_CONCURRENT_GH = 4;

const runPrStatus = (input: PrStatusInput): Effect.Effect<PrStatus | null> =>
	Effect.tryPromise({
		// Resolves the PR through whichever logged-in account can see the repo; any
		// failure (no PR, not authed, gh missing) collapses to null — i.e. no badge.
		try: (signal) => resolvePrStatus(input.repoPath, signal),
		catch: () => null,
	}).pipe(Effect.orElseSucceed(() => null));

export const GitHubServiceLive: Layer.Layer<GitHubService> = Layer.effect(GitHubService)(
	Effect.gen(function* () {
		const semaphore = yield* Semaphore.make(MAX_CONCURRENT_GH);
		const prStatus: GitHubServiceShape["prStatus"] = (input) =>
			semaphore.withPermits(1)(runPrStatus(input));
		return GitHubService.of({ prStatus });
	}),
);

// ---------------------------------------------------------------------------
// IPC boundary — owns caching + in-flight dedupe so the renderer stays dumb.
// ---------------------------------------------------------------------------

const TTL_FOUND_MS = 60_000;
const TTL_EMPTY_MS = 20_000; // re-check sooner so a freshly opened PR shows up.

const runtime = ManagedRuntime.make(GitHubServiceLive);
const cache = new Map<string, { value: PrStatus | null; expires: number }>();
const inflight = new Map<string, Promise<PrStatus | null>>();

const loadPrStatus = (input: PrStatusInput): Promise<PrStatus | null> =>
	runtime.runPromise(
		Effect.gen(function* () {
			const service = yield* GitHubService;
			return yield* service.prStatus(input);
		}),
	);

export const registerGitHubHandlers = (): void => {
	ipcMain.handle(
		"github:pr-status",
		async (_event, input: PrStatusInput): Promise<PrStatus | null> => {
			if (!input?.repoPath) return null;
			// gh needs the user's PATH (to be found) and login env; both land in
			// process.env once the startup env capture resolves.
			await userEnvReady();

			const key = input.repoPath;
			const now = Date.now();

			const cached = cache.get(key);
			if (cached && cached.expires > now) return cached.value;

			const existing = inflight.get(key);
			if (existing) return existing;

			const pending = loadPrStatus(input)
				.then((value) => {
					cache.set(key, {
						value,
						expires: Date.now() + (value ? TTL_FOUND_MS : TTL_EMPTY_MS),
					});
					return value;
				})
				.catch(() => null)
				.finally(() => {
					inflight.delete(key);
				});

			inflight.set(key, pending);
			return pending;
		},
	);
};

export const disposeGitHub = (): void => {
	cache.clear();
	inflight.clear();
	tokenCache.clear();
	resolvedAccount.clear();
	void runtime.dispose();
};
