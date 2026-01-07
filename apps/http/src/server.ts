import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Effect, Layer } from "effect";
import { WorktreeRpc, WorktreeRpcHandlersLive } from "@sandcastle/rpc";

const RpcLayer = RpcServer.layer(WorktreeRpc).pipe(Layer.provide(WorktreeRpcHandlersLive));

const HttpProtocol = RpcServer.layerProtocolHttp({
  path: "/api/rpc"
}).pipe(Layer.provide(RpcSerialization.layerNdjson));

const CustomRoutes = HttpRouter.Default.use(router =>
  Effect.gen(function* () {
    yield* router.get("/api/health", HttpServerResponse.json({ status: "ok" }));
  })
);

const port = Number(process.env.PORT) || 3000;

export const makeServerLayer = (options?: { port?: number }) =>
  HttpRouter.Default.serve().pipe(
    Layer.provide(CustomRoutes),
    Layer.provide(RpcLayer),
    Layer.provide(HttpProtocol),
    Layer.provide(BunHttpServer.layer({ port: options?.port ?? port }))
  );

export const ServerLive = makeServerLayer();

BunRuntime.runMain(Layer.launch(ServerLive));
