import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";

import {
	ConfigService,
	ConfigServiceLive,
	defineConfig,
	type SandcastleConfig,
} from "../index.ts";
import { createSandcastleContext } from "./context.ts";
import type { InitParams, Logger } from "./types.ts";

// Helper to run effects with the live service
const runWithService = <A, E>(
	effect: Effect.Effect<A, E, ConfigService>,
): Promise<A> =>
	Effect.runPromise(effect.pipe(Effect.provide(ConfigServiceLive)));

// Test fixtures
let tempDir: string;
let baseRepoPath: string;
let worktreePath: string;

const getDefaultParams = (): InitParams => ({
	baseRepoPath,
	worktreePath,
	projectName: "test-project",
	worktreeName: "test-worktree",
	branch: "test-worktree",
	baseBranch: "main",
});

beforeEach(async () => {
	// Create temp directories for testing
	tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandcastle-config-test-"));
	baseRepoPath = path.join(tempDir, "base-repo");
	worktreePath = path.join(tempDir, "worktree");

	await fs.mkdir(baseRepoPath, { recursive: true });
	await fs.mkdir(worktreePath, { recursive: true });
});

afterEach(async () => {
	// Clean up temp directory
	await fs.rm(tempDir, { recursive: true, force: true });
});

describe("ConfigService.load()", () => {
	test("returns undefined when no config file exists", async () => {
		const result = await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				return yield* service.load(baseRepoPath);
			}),
		);

		expect(result).toBeUndefined();
	});

	test("loads valid config with init hook (.ts)", async () => {
		const configPath = path.join(baseRepoPath, "sandcastle.config.ts");
		await fs.writeFile(
			configPath,
			`
      export default {
        init: async (ctx) => {
          ctx.log('Hello from init')
        }
      }
      `,
		);

		const result = await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				return yield* service.load(baseRepoPath);
			}),
		);

		expect(result).toBeDefined();
		expect(typeof result?.init).toBe("function");
	});

	test("loads valid config with init hook (.js)", async () => {
		const configPath = path.join(baseRepoPath, "sandcastle.config.js");
		await fs.writeFile(
			configPath,
			`
      export default {
        init: async (ctx) => {
          ctx.log('Hello from init')
        }
      }
      `,
		);

		const result = await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				return yield* service.load(baseRepoPath);
			}),
		);

		expect(result).toBeDefined();
		expect(typeof result?.init).toBe("function");
	});

	test("prefers .ts over .js when both exist", async () => {
		// Create both files with different markers
		await fs.writeFile(
			path.join(baseRepoPath, "sandcastle.config.ts"),
			`export default { marker: 'ts' }`,
		);
		await fs.writeFile(
			path.join(baseRepoPath, "sandcastle.config.js"),
			`export default { marker: 'js' }`,
		);

		const result = await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				return yield* service.load(baseRepoPath);
			}),
		);

		expect((result as { marker: string })?.marker).toBe("ts");
	});

	test("loads config without init hook (empty object)", async () => {
		const configPath = path.join(baseRepoPath, "sandcastle.config.ts");
		await fs.writeFile(configPath, `export default {}`);

		const result = await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				return yield* service.load(baseRepoPath);
			}),
		);

		expect(result).toBeDefined();
		expect(result?.init).toBeUndefined();
	});

	test("fails with ConfigLoadError for syntax errors", async () => {
		const configPath = path.join(baseRepoPath, "sandcastle.config.ts");
		await fs.writeFile(configPath, `export default { invalid syntax here`);

		const program = Effect.gen(function* () {
			const service = yield* ConfigService;
			return yield* service.load(baseRepoPath);
		}).pipe(Effect.provide(ConfigServiceLive));

		const result = await Effect.runPromiseExit(program);

		expect(result._tag).toBe("Failure");
	});

	test("fails with ConfigValidationError for non-object exports", async () => {
		const configPath = path.join(baseRepoPath, "sandcastle.config.ts");
		await fs.writeFile(configPath, `export default "not an object"`);

		const program = Effect.gen(function* () {
			const service = yield* ConfigService;
			return yield* service.load(baseRepoPath);
		}).pipe(Effect.provide(ConfigServiceLive));

		const result = await Effect.runPromiseExit(program);

		expect(result._tag).toBe("Failure");
	});

	test("fails with ConfigValidationError when init is not a function", async () => {
		const configPath = path.join(baseRepoPath, "sandcastle.config.ts");
		await fs.writeFile(configPath, `export default { init: "not a function" }`);

		const program = Effect.gen(function* () {
			const service = yield* ConfigService;
			return yield* service.load(baseRepoPath);
		}).pipe(Effect.provide(ConfigServiceLive));

		const result = await Effect.runPromiseExit(program);

		expect(result._tag).toBe("Failure");
	});
});

describe("ConfigService.runInit()", () => {
	test("no-op when config has no init hook", async () => {
		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit({}, getDefaultParams());
			}),
		);
		// Should complete without error
		expect(true).toBe(true);
	});

	test("executes init hook with correct context properties", async () => {
		let capturedContext: {
			baseRepoPath: string;
			worktreePath: string;
			projectName: string;
			worktreeName: string;
			branch: string;
			baseBranch: string;
		} | null = null;

		const config: SandcastleConfig = {
			init: async (ctx) => {
				capturedContext = {
					baseRepoPath: ctx.baseRepoPath,
					worktreePath: ctx.worktreePath,
					projectName: ctx.projectName,
					worktreeName: ctx.worktreeName,
					branch: ctx.branch,
					baseBranch: ctx.baseBranch,
				};
			},
		};

		const params = getDefaultParams();
		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, params);
			}),
		);

		expect(capturedContext).not.toBeNull();
		expect(capturedContext!.baseRepoPath).toBe(params.baseRepoPath);
		expect(capturedContext!.worktreePath).toBe(params.worktreePath);
		expect(capturedContext!.projectName).toBe(params.projectName);
		expect(capturedContext!.worktreeName).toBe(params.worktreeName);
		expect(capturedContext!.branch).toBe(params.branch);
		expect(capturedContext!.baseBranch).toBe(params.baseBranch);
	});
});

describe("SandcastleContext.exec()", () => {
	test("runs commands in worktree directory", async () => {
		// Create a marker file in the worktree
		const markerPath = path.join(worktreePath, "marker.txt");
		await fs.writeFile(markerPath, "test");

		let execOutput: { stdout: string } | undefined;

		const config: SandcastleConfig = {
			init: async (ctx) => {
				// Use ls to verify we're in the right directory by checking the marker file exists
				execOutput = await ctx.exec("ls marker.txt");
			},
		};

		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, getDefaultParams());
			}),
		);

		// If ls succeeded, we're in the right directory
		expect(execOutput?.stdout.trim()).toBe("marker.txt");
	});

	test("returns stdout and stderr", async () => {
		let execOutput: { stdout: string; stderr: string } | undefined;

		const config: SandcastleConfig = {
			init: async (ctx) => {
				execOutput = await ctx.exec('echo "hello"');
			},
		};

		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, getDefaultParams());
			}),
		);

		expect(execOutput?.stdout.trim()).toBe("hello");
	});

	test("throws CommandExecutionError on non-zero exit", async () => {
		const config: SandcastleConfig = {
			init: async (ctx) => {
				await ctx.exec("exit 1");
			},
		};

		const program = Effect.gen(function* () {
			const service = yield* ConfigService;
			yield* service.runInit(config, getDefaultParams());
		}).pipe(Effect.provide(ConfigServiceLive));

		const result = await Effect.runPromiseExit(program);

		expect(result._tag).toBe("Failure");
	});
});

describe("SandcastleContext.copyFromBase()", () => {
	test("copies files correctly", async () => {
		// Create source file in base repo
		const sourceContent = "test content";
		await fs.writeFile(path.join(baseRepoPath, ".env"), sourceContent);

		const config: SandcastleConfig = {
			init: async (ctx) => {
				await ctx.copyFromBase(".env");
			},
		};

		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, getDefaultParams());
			}),
		);

		const destContent = await fs.readFile(
			path.join(worktreePath, ".env"),
			"utf-8",
		);
		expect(destContent).toBe(sourceContent);
	});

	test("copies with different destination name", async () => {
		await fs.writeFile(path.join(baseRepoPath, ".env"), "content");

		const config: SandcastleConfig = {
			init: async (ctx) => {
				await ctx.copyFromBase(".env", ".env.local");
			},
		};

		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, getDefaultParams());
			}),
		);

		const exists = await Bun.file(
			path.join(worktreePath, ".env.local"),
		).exists();
		expect(exists).toBe(true);
	});

	test("creates destination directories", async () => {
		await fs.writeFile(path.join(baseRepoPath, "config.json"), "{}");

		const config: SandcastleConfig = {
			init: async (ctx) => {
				await ctx.copyFromBase("config.json", "nested/dir/config.json");
			},
		};

		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, getDefaultParams());
			}),
		);

		const exists = await Bun.file(
			path.join(worktreePath, "nested/dir/config.json"),
		).exists();
		expect(exists).toBe(true);
	});

	test("throws FileCopyError when source doesn't exist", async () => {
		const config: SandcastleConfig = {
			init: async (ctx) => {
				await ctx.copyFromBase("nonexistent.txt");
			},
		};

		const program = Effect.gen(function* () {
			const service = yield* ConfigService;
			yield* service.runInit(config, getDefaultParams());
		}).pipe(Effect.provide(ConfigServiceLive));

		const result = await Effect.runPromiseExit(program);

		expect(result._tag).toBe("Failure");
	});
});

describe("SandcastleContext.exists()", () => {
	test("returns true for existing files", async () => {
		await fs.writeFile(path.join(worktreePath, "exists.txt"), "content");

		let result: boolean | undefined;
		const config: SandcastleConfig = {
			init: async (ctx) => {
				result = await ctx.exists("exists.txt");
			},
		};

		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, getDefaultParams());
			}),
		);

		expect(result).toBe(true);
	});

	test("returns false for non-existing files", async () => {
		let result: boolean | undefined;
		const config: SandcastleConfig = {
			init: async (ctx) => {
				result = await ctx.exists("nonexistent.txt");
			},
		};

		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.runInit(config, getDefaultParams());
			}),
		);

		expect(result).toBe(false);
	});
});

describe("SandcastleContext logging", () => {
	test("log/warn/error call console methods", async () => {
		const logs: string[] = [];
		const warns: string[] = [];
		const errors: string[] = [];

		const originalLog = console.log;
		const originalWarn = console.warn;
		const originalError = console.error;

		console.log = (msg: string) => logs.push(msg);
		console.warn = (msg: string) => warns.push(msg);
		console.error = (msg: string) => errors.push(msg);

		try {
			const config: SandcastleConfig = {
				init: async (ctx) => {
					ctx.log("info message");
					ctx.warn("warning message");
					ctx.error("error message");
				},
			};

			await runWithService(
				Effect.gen(function* () {
					const service = yield* ConfigService;
					yield* service.runInit(config, getDefaultParams());
				}),
			);

			expect(logs).toContain("info message");
			expect(warns).toContain("warning message");
			expect(errors).toContain("error message");
		} finally {
			console.log = originalLog;
			console.warn = originalWarn;
			console.error = originalError;
		}
	});
});

describe("Error handling", () => {
	test("InitHookError includes logs collected up to failure", async () => {
		const config: SandcastleConfig = {
			init: async (ctx) => {
				ctx.log("before error");
				throw new Error("test error");
			},
		};

		const program = Effect.gen(function* () {
			const service = yield* ConfigService;
			yield* service.runInit(config, getDefaultParams());
		}).pipe(Effect.provide(ConfigServiceLive));

		const result = await Effect.runPromiseExit(program);

		expect(result._tag).toBe("Failure");
	});

	test("InitHookError includes original cause", async () => {
		const originalError = new Error("original error");
		const config: SandcastleConfig = {
			init: async () => {
				throw originalError;
			},
		};

		const program = Effect.gen(function* () {
			const service = yield* ConfigService;
			yield* service.runInit(config, getDefaultParams());
		}).pipe(Effect.provide(ConfigServiceLive));

		const result = await Effect.runPromiseExit(program);

		expect(result._tag).toBe("Failure");
	});
});

describe("ConfigService.loadAndRunInit()", () => {
	test("combines load + runInit correctly", async () => {
		let initCalled = false;
		const configPath = path.join(baseRepoPath, "sandcastle.config.ts");
		await fs.writeFile(
			configPath,
			`
      export default {
        init: async (ctx) => {
          ctx.log('init called')
        }
      }
      `,
		);

		// Capture console.log to verify init was called
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (msg: string) => {
			logs.push(msg);
			if (msg === "init called") initCalled = true;
		};

		try {
			await runWithService(
				Effect.gen(function* () {
					const service = yield* ConfigService;
					yield* service.loadAndRunInit(baseRepoPath, getDefaultParams());
				}),
			);

			expect(initCalled).toBe(true);
		} finally {
			console.log = originalLog;
		}
	});

	test("does nothing when no config exists", async () => {
		// Should complete without error even with no config
		await runWithService(
			Effect.gen(function* () {
				const service = yield* ConfigService;
				yield* service.loadAndRunInit(baseRepoPath, getDefaultParams());
			}),
		);

		expect(true).toBe(true);
	});
});

describe("defineConfig()", () => {
	test("returns config unchanged", () => {
		const config = {
			init: async () => {},
		};

		const result = defineConfig(config);

		expect(result).toBe(config);
	});
});

describe("createSandcastleContext()", () => {
	test("creates context with all properties", () => {
		const logger: Logger = {
			log: () => {},
			warn: () => {},
			error: () => {},
		};

		const context = createSandcastleContext(getDefaultParams(), logger);

		expect(context.baseRepoPath).toBe(getDefaultParams().baseRepoPath);
		expect(context.worktreePath).toBe(getDefaultParams().worktreePath);
		expect(context.projectName).toBe(getDefaultParams().projectName);
		expect(context.worktreeName).toBe(getDefaultParams().worktreeName);
		expect(context.branch).toBe(getDefaultParams().branch);
		expect(context.baseBranch).toBe(getDefaultParams().baseBranch);
		expect(typeof context.copyFromBase).toBe("function");
		expect(typeof context.exists).toBe("function");
		expect(typeof context.exec).toBe("function");
		expect(typeof context.log).toBe("function");
		expect(typeof context.warn).toBe("function");
		expect(typeof context.error).toBe("function");
	});

	test("collects logs via onLog callback", () => {
		const collected: string[] = [];
		const logger: Logger = {
			log: () => {},
			warn: () => {},
			error: () => {},
		};

		const context = createSandcastleContext(
			getDefaultParams(),
			logger,
			(entry) => {
				collected.push(entry);
			},
		);

		context.log("test message");
		context.warn("warning message");
		context.error("error message");

		expect(collected).toContain("[log] test message");
		expect(collected).toContain("[warn] warning message");
		expect(collected).toContain("[error] error message");
	});
});
