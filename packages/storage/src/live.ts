import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect, Layer } from "effect";

import { createChatMessagesService } from "./chat/service";
import { DatabaseConnectionError } from "./errors";
import { runMigrations } from "./migrations";
import type { UpdateRepositoryInput } from "./repository/schema";
import { createRepositoriesService } from "./repository/service";
import { StorageService } from "./service";
import type { UpdateSessionInput } from "./session/schema";
import { createSessionsService } from "./session/service";
import { tryDb } from "./utils";
import type { UpdateWorktreeInput } from "./worktree/schema";
import { createWorktreesService } from "./worktree/service";

export interface StorageConfig {
	databasePath?: string;
}

export const makeStorageService = (
	config: StorageConfig = {},
): Effect.Effect<typeof StorageService.Service, DatabaseConnectionError> =>
	Effect.gen(function* () {
		const defaultPath = path.join(os.homedir(), ".sandcastle", "data.db");
		const dbPath = config.databasePath ?? defaultPath;

		const dbDir = path.dirname(dbPath);
		if (!fs.existsSync(dbDir)) {
			yield* Effect.try({
				try: () => fs.mkdirSync(dbDir, { recursive: true }),
				catch: (error) =>
					new DatabaseConnectionError({
						path: dbPath,
						message: `Failed to create database directory: ${error}`,
					}),
			});
		}

		const db = yield* Effect.try({
			try: () => new Database(dbPath, { create: true, strict: true }),
			catch: (error) =>
				new DatabaseConnectionError({
					path: dbPath,
					message: `Failed to open database: ${error}`,
				}),
		});

		db.run("PRAGMA journal_mode = WAL");
		db.run("PRAGMA foreign_keys = ON");

		yield* runMigrations(db).pipe(
			Effect.mapError(
				(migrationError) =>
					new DatabaseConnectionError({
						path: dbPath,
						message: `Migration failed: ${migrationError.message}`,
					}),
			),
		);

		const repositoriesService = createRepositoriesService(db);
		const worktreesService = createWorktreesService(db);
		const sessionsService = createSessionsService(db);
		const chatMessagesService = createChatMessagesService(db);

		return {
			initialize: () => Effect.void,

			close: () =>
				tryDb("close", () => {
					db.close();
				}),

			repositories: {
				list: repositoriesService.list,
				get: repositoriesService.get,
				getByPath: repositoriesService.getByPath,
				create: repositoriesService.create,
				update: (id: string, input: UpdateRepositoryInput) =>
					repositoriesService.update(id, input, repositoriesService.get),
				delete: (id: string) =>
					repositoriesService.delete(id, repositoriesService.get),
			},

			worktrees: {
				list: worktreesService.list,
				listByRepository: worktreesService.listByRepository,
				get: worktreesService.get,
				getByPath: worktreesService.getByPath,
				create: worktreesService.create,
				update: (id: string, input: UpdateWorktreeInput) =>
					worktreesService.update(id, input, worktreesService.get),
				delete: (id: string) =>
					worktreesService.delete(id, worktreesService.get),
				touch: (id: string) => worktreesService.touch(id, worktreesService.get),
			},

			sessions: {
				list: sessionsService.list,
				listByWorktree: sessionsService.listByWorktree,
				get: sessionsService.get,
				create: sessionsService.create,
				update: (id: string, input: UpdateSessionInput) =>
					sessionsService.update(id, input, sessionsService.get),
				delete: (id: string) => sessionsService.delete(id, sessionsService.get),
				touch: (id: string) => sessionsService.touch(id, sessionsService.get),
			},

			chatMessages: {
				listBySession: chatMessagesService.listBySession,
				get: chatMessagesService.get,
				create: chatMessagesService.create,
				delete: (id: string) =>
					chatMessagesService.delete(id, chatMessagesService.get),
				deleteBySession: chatMessagesService.deleteBySession,
			},
		};
	});

export const StorageServiceLive = (config?: StorageConfig) =>
	Layer.effect(StorageService, makeStorageService(config));

export const StorageServiceDefault = StorageServiceLive();
