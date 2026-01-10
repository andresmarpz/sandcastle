import { HttpMiddleware, HttpRouter, HttpServerResponse } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Effect, Layer } from "effect";

import { ChatRpc, RepositoryRpc, SessionRpc, WorktreeRpc } from "@sandcastle/rpc";

import {
  ChatRpcHandlersLive,
  RepositoryRpcHandlersLive,
  SessionRpcHandlersLive,
  WorktreeRpcHandlersLive
} from "./handlers";
import { StartupTasksLive } from "./startup";

const CorsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ["*"], // In production, specify exact origins like ["https://your-app.com"]
  allowedMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    // Tracing headers (B3/OpenTelemetry)
    "b3",
    "traceparent",
    "tracestate"
  ],
  exposedHeaders: ["Content-Length", "X-Request-Id"],
  maxAge: 86400, // 24 hours - browsers cache preflight responses
  credentials: false // Set to true if you need cookies/auth headers
});

// ─── RPC Layers ──────────────────────────────────────────────

const SandcastleRpc = RepositoryRpc.merge(WorktreeRpc).merge(SessionRpc).merge(ChatRpc);

const RpcHandlersLive = Layer.mergeAll(
  RepositoryRpcHandlersLive,
  WorktreeRpcHandlersLive,
  SessionRpcHandlersLive,
  ChatRpcHandlersLive
);

const RpcLayer = RpcServer.layer(SandcastleRpc).pipe(Layer.provide(RpcHandlersLive));

const HttpProtocol = RpcServer.layerProtocolHttp({
  path: "/api/rpc"
}).pipe(Layer.provide(RpcSerialization.layerJson));

// ─── Custom Routes ───────────────────────────────────────────

const CustomRoutes = HttpRouter.Default.use(router =>
  Effect.gen(function* () {
    yield* router.get("/api/health", HttpServerResponse.json({ status: "ok" }));
  })
);

// ─── Server ──────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3000;

export const makeServerLayer = (options?: { port?: number }) =>
  HttpRouter.Default.serve(CorsMiddleware).pipe(
    Layer.provide(CustomRoutes),
    Layer.provide(RpcLayer),
    Layer.provide(HttpProtocol),
    Layer.provide(BunHttpServer.layer({ port: options?.port ?? port }))
  );

export const ServerLive = Layer.mergeAll(makeServerLayer(), StartupTasksLive);

BunRuntime.runMain(Layer.launch(ServerLive));
