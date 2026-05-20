import { IsoDateTime } from "@sandcastle/contracts"

export const now = (): IsoDateTime => IsoDateTime.make(new Date().toISOString())
