import { Schema } from "effect";

/**
 * Generic database operation error.
 * Wraps underlying storage errors for RPC transport.
 */
export class DatabaseRpcError extends Schema.TaggedError<DatabaseRpcError>()("DatabaseRpcError", {
  operation: Schema.String,
  message: Schema.String
}) {}

/**
 * Foreign key constraint violation.
 * Occurs when referencing a non-existent parent entity.
 */
export class ForeignKeyViolationRpcError extends Schema.TaggedError<ForeignKeyViolationRpcError>()(
  "ForeignKeyViolationRpcError",
  {
    entity: Schema.String,
    foreignKey: Schema.String,
    foreignId: Schema.String
  }
) {}
