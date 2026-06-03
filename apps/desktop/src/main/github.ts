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
		try: async (signal) => {
			const { stdout } = await execFileAsync("gh", ["pr", "view", "--json", GH_FIELDS], {
				cwd: input.repoPath,
				timeout: GH_TIMEOUT_MS,
				maxBuffer: GH_MAX_BUFFER,
				signal,
			});
			return toPrStatus(JSON.parse(stdout) as Record<string, unknown>);
		},
		// gh exits non-zero when no PR exists for the branch, when not authed, or
		// when not installed — all of which just mean "no badge".
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
	void runtime.dispose();
};
