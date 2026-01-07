import { HttpRouter } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { Layer } from "effect"
import { WorktreeRpc, WorktreeRpcHandlersLive } from "@sandcastle/rpc"

// Create the RPC server layer
const RpcLayer = RpcServer.layer(WorktreeRpc).pipe(
  Layer.provide(WorktreeRpcHandlersLive)
)

// HTTP protocol with NDJSON serialization
const HttpProtocol = RpcServer.layerProtocolHttp({
  path: "/rpc"
}).pipe(Layer.provide(RpcSerialization.layerNdjson))

// Export configurable server layer
export const makeServerLayer = (port: number) =>
  HttpRouter.Default.serve().pipe(
    Layer.provide(RpcLayer),
    Layer.provide(HttpProtocol),
    Layer.provide(BunHttpServer.layer({ port }))
  )

// Port from environment or default to 3000
const port = Number(process.env.PORT) || 3000

// Default server layer
export const ServerLive = makeServerLayer(port)

// Main entry point - runs when file is executed directly
BunRuntime.runMain(Layer.launch(ServerLive))
