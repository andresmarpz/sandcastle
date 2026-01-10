import {
	DatabaseRpcError,
	Repository,
	RepositoryNotFoundRpcError,
	RepositoryPathExistsRpcError,
	RepositoryRpc,
} from "@sandcastle/rpc";
import {
	type DatabaseError,
	type RepositoryNotFoundError,
	type RepositoryPathExistsError,
	StorageService,
	StorageServiceDefault,
} from "@sandcastle/storage";
import { Effect, Layer } from "effect";

// ─── Error Mapping ───────────────────────────────────────────

const mapDatabaseError = (error: DatabaseError): DatabaseRpcError =>
	new DatabaseRpcError({ operation: error.operation, message: error.message });

const mapNotFoundError = (
	error: RepositoryNotFoundError | DatabaseError,
): RepositoryNotFoundRpcError | DatabaseRpcError => {
	if (error._tag === "RepositoryNotFoundError") {
		return new RepositoryNotFoundRpcError({ id: error.id });
	}
	return mapDatabaseError(error);
};

const mapCreateError = (
	error: RepositoryPathExistsError | DatabaseError,
): RepositoryPathExistsRpcError | DatabaseRpcError => {
	if (error._tag === "RepositoryPathExistsError") {
		return new RepositoryPathExistsRpcError({
			directoryPath: error.directoryPath,
		});
	}
	return mapDatabaseError(error);
};

const mapDeleteError = (
	error: RepositoryNotFoundError | DatabaseError,
): RepositoryNotFoundRpcError | DatabaseRpcError => mapNotFoundError(error);

// ─── Response Mapping ────────────────────────────────────────

const toRepository = (repo: {
	id: string;
	label: string;
	directoryPath: string;
	defaultBranch: string;
	pinned: boolean;
	createdAt: string;
	updatedAt: string;
}): Repository =>
	new Repository({
		id: repo.id,
		label: repo.label,
		directoryPath: repo.directoryPath,
		defaultBranch: repo.defaultBranch,
		pinned: repo.pinned,
		createdAt: repo.createdAt,
		updatedAt: repo.updatedAt,
	});

// ─── Handlers ────────────────────────────────────────────────

export const RepositoryRpcHandlers = RepositoryRpc.toLayer(
	Effect.gen(function* () {
		const storage = yield* StorageService;

		return RepositoryRpc.of({
			"repository.list": () =>
				storage.repositories.list().pipe(
					Effect.map((repos) => repos.map(toRepository)),
					Effect.mapError(mapDatabaseError),
				),

			"repository.get": (params) =>
				storage.repositories
					.get(params.id)
					.pipe(Effect.map(toRepository), Effect.mapError(mapNotFoundError)),

			"repository.getByPath": (params) =>
				storage.repositories
					.getByPath(params.directoryPath)
					.pipe(Effect.map(toRepository), Effect.mapError(mapNotFoundError)),

			"repository.create": (params) =>
				storage.repositories
					.create({
						label: params.label,
						directoryPath: params.directoryPath,
						defaultBranch: params.defaultBranch,
					})
					.pipe(Effect.map(toRepository), Effect.mapError(mapCreateError)),

			"repository.update": (params) =>
				storage.repositories
					.update(params.id, {
						label: params.input.label,
						defaultBranch: params.input.defaultBranch,
					})
					.pipe(Effect.map(toRepository), Effect.mapError(mapNotFoundError)),

			"repository.delete": (params) =>
				storage.repositories
					.delete(params.id)
					.pipe(Effect.mapError(mapDeleteError)),
		});
	}),
);

export const RepositoryRpcHandlersLive = RepositoryRpcHandlers.pipe(
	Layer.provide(StorageServiceDefault),
);
