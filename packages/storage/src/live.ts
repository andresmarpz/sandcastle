import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect, Layer } from "effect";

import { createAgentsService } from "./agents";
import { createChatMessagesService } from "./chat-messages";
import { DatabaseConnectionError } from "./errors";
import { runMigrations } from "./migrations";
import { createRepositoriesService } from "./repositories";
import { StorageService } from "./service";
import { createSessionsService } from "./sessions";
import { tryDb } from "./utils";
import { createWorktreesService } from "./worktrees";

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
		const agentsService = createAgentsService(db);
		const chatMessagesService = createChatMessagesService(db);

		const service: typeof StorageService.Service = {
			initialize: () => runMigrations(db),

			close: () =>
				tryDb("close", () => {
					db.close();
				}),

			repositories: {
				list: repositoriesService.list,
				get: repositoriesService.get,
				getByPath: repositoriesService.getByPath,
				create: repositoriesService.create,
				update: (id, input) =>
					repositoriesService.update(id, input, repositoriesService.get),
				delete: (id) => repositoriesService.delete(id, repositoriesService.get),
			},

			worktrees: {
				list: worktreesService.list,
				listByRepository: worktreesService.listByRepository,
				get: worktreesService.get,
				getByPath: worktreesService.getByPath,
				create: worktreesService.create,
				update: (id, input) =>
					worktreesService.update(id, input, worktreesService.get),
				delete: (id) => worktreesService.delete(id, worktreesService.get),
				touch: (id) => worktreesService.touch(id, worktreesService.get),
			},

			sessions: {
				list: sessionsService.list,
				listByWorktree: sessionsService.listByWorktree,
				get: sessionsService.get,
				create: sessionsService.create,
				update: (id, input) =>
					sessionsService.update(id, input, sessionsService.get),
				delete: (id) => sessionsService.delete(id, sessionsService.get),
				touch: (id) => sessionsService.touch(id, sessionsService.get),
			},

			agents: {
				list: agentsService.list,
				listBySession: agentsService.listBySession,
				get: agentsService.get,
				create: agentsService.create,
				update: (id, input) =>
					agentsService.update(id, input, agentsService.get),
				delete: (id) => agentsService.delete(id, agentsService.get),
			},

			chatMessages: {
				listBySession: chatMessagesService.listBySession,
				get: chatMessagesService.get,
				create: chatMessagesService.create,
				delete: (id) => chatMessagesService.delete(id, chatMessagesService.get),
				deleteBySession: chatMessagesService.deleteBySession,
			},
		};

		return service;
	});

export const StorageServiceLive = (config?: StorageConfig) =>
	Layer.effect(StorageService, makeStorageService(config));

export const StorageServiceDefault = StorageServiceLive();
