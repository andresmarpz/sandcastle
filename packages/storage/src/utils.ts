import type { Database, SQLQueryBindings } from "bun:sqlite";
import { Effect } from "effect";

import { DatabaseError } from "./errors";

export const generateId = () => crypto.randomUUID();

export const nowIso = () => new Date().toISOString();

export const tryDb = <T>(
	operation: string,
	fn: () => T,
): Effect.Effect<T, DatabaseError> =>
	Effect.try({
		try: fn,
		catch: (error) =>
			new DatabaseError({
				operation,
				message: error instanceof Error ? error.message : String(error),
				cause: error,
			}),
	});

export type DbInstance = Database;
export type { SQLQueryBindings };
