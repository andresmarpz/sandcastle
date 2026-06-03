import { BunRuntime } from "@effect/platform-bun";
import { Layer } from "effect";

import { watchParent } from "./lib/parentWatch.ts";
import { ServerLive } from "./runtime.ts";

// When spawned as the Electron sidecar, exit if the parent dies (see module).
// No-op when run standalone (no SANDCASTLE_PARENT_PID).
watchParent();

BunRuntime.runMain(Layer.launch(ServerLive));
