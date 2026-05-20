import type { BlobHash } from "./ids.ts"
import type { IsoDateTime } from "./time.ts"

export interface Blob {
  readonly hash: BlobHash
  readonly mime: string
  readonly size: number
  readonly createdAt: IsoDateTime
}
