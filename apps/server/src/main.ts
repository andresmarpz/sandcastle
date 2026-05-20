import { Layer } from "effect"
import { BunRuntime } from "@effect/platform-bun"

import { ServerLive } from "./runtime.ts"

BunRuntime.runMain(Layer.launch(ServerLive))
