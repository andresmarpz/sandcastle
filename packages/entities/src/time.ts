import { Brand } from "effect"

export type IsoDateTime = string & Brand.Brand<"IsoDateTime">
export const IsoDateTime = Brand.nominal<IsoDateTime>()
