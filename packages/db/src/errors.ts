import { Data } from "effect";

export class SqliteError extends Data.TaggedError("SqliteError")<{
	readonly cause: unknown;
	readonly query?: string;
}> {}

export class ProjectNotFound extends Data.TaggedError("ProjectNotFound")<{
	readonly projectId: string;
}> {}

export class ProjectPathConflict extends Data.TaggedError("ProjectPathConflict")<{
	readonly rootPath: string;
}> {}

export class ProjectReorderMismatch extends Data.TaggedError("ProjectReorderMismatch")<{
	readonly expected: ReadonlyArray<string>;
	readonly got: ReadonlyArray<string>;
}> {}

export class WorkspaceNotFound extends Data.TaggedError("WorkspaceNotFound")<{
	readonly workspaceId: string;
}> {}

export class WorkspacePathConflict extends Data.TaggedError("WorkspacePathConflict")<{
	readonly path: string;
}> {}
