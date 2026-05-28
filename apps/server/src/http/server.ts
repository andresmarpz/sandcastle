import { BunHttpServer } from "@effect/platform-bun";
import { SandcastleRpc } from "@sandcastle/contracts";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { ServerConfig } from "../config/ConfigService.ts";
import { RpcHandlers } from "../rpc/index.ts";

/**
 * Bun HTTP listener layer. Reads `ServerConfig` for host/port at build
 * time. The HTTP layer requires `BunServices`, `HttpPlatform`, and
 * `Etag.Generator` — `BunHttpServer.layer(...)` provides all three.
 */
const HttpServerLive = Layer.unwrap(
	Effect.gen(function* () {
		const config = yield* ServerConfig;
		return BunHttpServer.layer({
			hostname: config.host,
			port: config.port,
		});
	}),
);

/**
 * `GET /health` — used by load balancers and the desktop app's connection
 * picker to know the relay is up before establishing the WS.
 */
const HealthRoute = HttpRouter.add("GET", "/health", Effect.succeed(HttpServerResponse.text("ok")));

/**
 * `GET /rpc` (WebSocket upgrade) — the single application-control surface
 * (`docs/architecture.md` §3.2). All three v0 RPCs ride this connection.
 */
const RpcRoute = Layer.unwrap(
	Effect.succeed(
		HttpRouter.add(
			"GET",
			"/rpc",
			Effect.gen(function* () {
				const httpEffect = yield* RpcServer.toHttpEffectWebsocket(SandcastleRpc, {
					spanPrefix: "ws.rpc",
					spanAttributes: {
						"rpc.transport": "websocket",
						"rpc.system": "effect-rpc",
					},
				}).pipe(Effect.provide(Layer.provideMerge(RpcHandlers, RpcSerialization.layerJson)));
				return yield* httpEffect;
			}),
		),
	),
);

const Routes = Layer.mergeAll(HealthRoute, RpcRoute);

/**
 * Discard layer that logs the listening address once the server is up.
 * Helpful at boot — the desktop UI's "Server" picker won't get a useful
 * error when its config points at a port nothing's listening on.
 */
const ListenLogLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const server = yield* HttpServer.HttpServer;
		const address = server.address;
		if (address._tag === "TcpAddress") {
			yield* Effect.logInfo(
				`sandcastle relay listening on http://${address.hostname}:${address.port}`,
			);
		}
	}),
);

export const HttpLive = Layer.mergeAll(HttpRouter.serve(Routes), ListenLogLive).pipe(
	Layer.provideMerge(HttpServerLive),
);
