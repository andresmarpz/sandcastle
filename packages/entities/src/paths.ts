import { Brand } from "effect"

export type AbsolutePath = string & Brand.Brand<"AbsolutePath">
export const AbsolutePath = Brand.nominal<AbsolutePath>()
