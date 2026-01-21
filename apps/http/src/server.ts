import {
	HttpMiddleware,
	HttpRouter,
	HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import {
	ChatRpc,
	FilesRpc,
	GitRpc,
	RepositoryRpc,
	SessionRpc,
	WorktreeRpc,
} from "@sandcastle/rpc";
import { Effect, Layer } from "effect";

import {
	ChatRpcHandlersLive,
	FilesRpcHandlersLive,
	GitRpcHandlersLive,
	RepositoryRpcHandlersLive,
	SessionRpcHandlersLive,
	WorktreeRpcHandlersLive,
} from "./handlers";
import { StartupTasksLive } from "./startup";
import {
	layerProtocolWebsocketWithMetrics,
	WebSocketMetricsLive,
	WebSocketMetricsService,
} from "./websocket";

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
		"tracestate",
	],
	exposedHeaders: ["Content-Length", "X-Request-Id"],
	maxAge: 86400, // 24 hours - browsers cache preflight responses
	credentials: false, // Set to true if you need cookies/auth headers
});

const LoggingMiddleware = HttpMiddleware.make((app) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const start = Date.now();
		console.log(`→ ${request.method} ${request.url}`);

		const response = yield* app;
		const duration = Date.now() - start;
		console.log(
			`← ${request.method} ${request.url} ${response.status} (${duration}ms)`,
		);

		return response;
	}),
);

const SandcastleRpc = RepositoryRpc.merge(WorktreeRpc)
	.merge(SessionRpc)
	.merge(ChatRpc)
	.merge(FilesRpc)
	.merge(GitRpc);

const RpcHandlersLive = Layer.mergeAll(
	RepositoryRpcHandlersLive,
	WorktreeRpcHandlersLive,
	SessionRpcHandlersLive,
	ChatRpcHandlersLive,
	FilesRpcHandlersLive,
	GitRpcHandlersLive,
);

// HTTP RPC Server at /api/rpc
const HttpRpcServer = RpcServer.layer(SandcastleRpc).pipe(
	Layer.provide(RpcHandlersLive),
	Layer.provide(
		RpcServer.layerProtocolHttp({ path: "/api/rpc" }).pipe(
			Layer.provide(RpcSerialization.layerNdjson),
		),
	),
);

// WebSocket RPC Server at /ws (with connection metrics)
// Note: WebSocketMetricsLive is provided externally so it can be shared with CustomRoutes
const WebSocketRpcServer = RpcServer.layer(SandcastleRpc).pipe(
	Layer.provide(RpcHandlersLive),
	Layer.provide(
		layerProtocolWebsocketWithMetrics({ path: "/ws" }).pipe(
			Layer.provide(RpcSerialization.layerNdjson),
		),
	),
);

// Combined RPC layer (both HTTP and WebSocket)
const RpcLayers = Layer.mergeAll(HttpRpcServer, WebSocketRpcServer);

const CustomRoutes = HttpRouter.Default.use((router) =>
	Effect.gen(function* () {
		const metrics = yield* WebSocketMetricsService;

		// Health endpoint with WebSocket connection stats
		yield* router.get(
			"/api/health",
			Effect.gen(function* () {
				const stats = yield* metrics.getStats;
				return yield* HttpServerResponse.json({
					status: "ok",
					websocket: {
						activeConnections: stats.activeConnections,
						totalConnections: stats.totalConnections,
					},
				});
			}),
		);
	}),
);

const port = Number(process.env.PORT) || 3000;

export const makeServerLayer = (options?: { port?: number }) =>
	HttpRouter.Default.serve((httpApp) =>
		CorsMiddleware(LoggingMiddleware(httpApp)),
	).pipe(
		Layer.provide(CustomRoutes),
		Layer.provide(RpcLayers),
		Layer.provide(WebSocketMetricsLive),
		Layer.provide(
			BunHttpServer.layer({ port: options?.port ?? port, idleTimeout: 30 }),
		),
	);

export const ServerLive = Layer.mergeAll(makeServerLayer(), StartupTasksLive);

console.log(`Server starting on port ${port}...`);
BunRuntime.runMain(Layer.launch(ServerLive));
