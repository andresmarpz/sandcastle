import childProcess from "node:child_process";
import process from "node:process";

let promise: Promise<void> | null = null;

// Vars Electron/Node set that we don't want a user shell to overwrite.
const PROTECTED = new Set([
	"ELECTRON_RUN_AS_NODE",
	"ELECTRON_NO_ATTACH_CONSOLE",
	"NODE_OPTIONS",
	"PWD",
	"_",
]);

const parseEnvOutput = (buf: string): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const line of buf.split("\n")) {
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		const k = line.slice(0, eq);
		const v = line.slice(eq + 1);
		if (!k || PROTECTED.has(k)) continue;
		out[k] = v;
	}
	return out;
};

const runCapture = (): Promise<void> =>
	new Promise<void>((resolve) => {
		const shell = process.env.SHELL || "/bin/zsh";
		// Interactive + login shell prints its full env after sourcing rc files.
		// We do this exactly once at app start so subsequent PTY spawns can skip it.
		const child = childProcess.spawn(shell, ["-ilc", "command env"], {
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		});
		let buf = "";
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				// already gone
			}
		}, 5000);
		child.stdout?.on("data", (d: Buffer) => {
			buf += d.toString();
		});
		child.on("close", () => {
			clearTimeout(timer);
			const captured = parseEnvOutput(buf);
			for (const [k, v] of Object.entries(captured)) {
				process.env[k] = v;
			}
			resolve();
		});
		child.on("error", () => {
			clearTimeout(timer);
			resolve();
		});
	});

export const captureUserEnv = (): Promise<void> => {
	if (promise) return promise;
	if (process.platform === "win32") {
		promise = Promise.resolve();
		return promise;
	}
	promise = runCapture();
	return promise;
};

export const userEnvReady = (): Promise<void> =>
	promise ?? Promise.resolve();
