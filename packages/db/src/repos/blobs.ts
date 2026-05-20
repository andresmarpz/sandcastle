import {
  type Blob,
  type BlobHash,
  type IsoDateTime,
} from "@sandcastle/entities"
import { Context, Effect, Layer } from "effect"
import { Sqlite } from "../client.ts"
import type { SqliteError } from "../errors.ts"

interface BlobRow {
  readonly hash: string
  readonly mime: string
  readonly size: number
  readonly created_at: string
}

const decodeRow = (row: BlobRow): Blob => ({
  hash: row.hash as BlobHash,
  mime: row.mime,
  size: row.size,
  createdAt: row.created_at as IsoDateTime,
})

export interface UpsertBlobInput {
  readonly hash: BlobHash
  readonly mime: string
  readonly size: number
}

export class Blobs extends Context.Service<
  Blobs,
  {
    readonly getByHash: (
      hash: BlobHash,
    ) => Effect.Effect<Blob | null, SqliteError>
    readonly upsert: (input: UpsertBlobInput) => Effect.Effect<Blob, SqliteError>
  }
>()("@sandcastle/db/Blobs") {}

export const layer: Layer.Layer<Blobs, never, Sqlite> = Layer.effect(Blobs)(
  Effect.gen(function* () {
    const sqlite = yield* Sqlite

    const getByHash = (hash: BlobHash) =>
      sqlite
        .queryOne<BlobRow>(
          "SELECT hash, mime, size, created_at FROM blobs WHERE hash = ?",
          [hash as string],
        )
        .pipe(Effect.map((row) => (row === null ? null : decodeRow(row))))

    const upsert = (input: UpsertBlobInput) =>
      Effect.gen(function* () {
        const now = new Date().toISOString()
        yield* sqlite.run(
          "INSERT INTO blobs (hash, mime, size, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (hash) DO NOTHING",
          [input.hash as string, input.mime, input.size, now],
        )
        const row = yield* getByHash(input.hash)
        return row ?? {
          hash: input.hash,
          mime: input.mime,
          size: input.size,
          createdAt: now as IsoDateTime,
        }
      })

    return Blobs.of({ getByHash, upsert })
  }),
)
