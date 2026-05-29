import { BunHttpServer } from "@effect/platform-bun";
import { SandcastleRpc } from "@sandcastle/contracts";
import { Effect, Layer, Schema } from "effect";
import {
	HttpRouter,
	HttpServer,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { ServerConfig } from "../config/ConfigService.ts";
import { RpcHandlers } from "../rpc/index.ts";
import { WorkspaceService } from "../services/WorkspaceService.ts";

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

/**
 * `POST /workspaces/upsert-for-path` — find-or-create the workspace owning an
 * absolute path (no `git worktree add`). Plain JSON (not WS RPC) because its
 * only caller is the Electron MAIN process driving the MCP "teleport" flow:
 * main is not an Effect/RPC client, so it calls this with a bare `fetch`.
 * Always 200; an unresolvable path returns `{ workspace: null, reason }`.
 */
const UpsertForPathBody = Schema.Struct({ path: Schema.String });

const WorkspaceUpsertRoute = HttpRouter.add(
	"POST",
	"/workspaces/upsert-for-path",
	Effect.gen(function* () {
		const workspaces = yield* WorkspaceService;
		const body = yield* HttpServerRequest.schemaBodyJson(UpsertForPathBody);
		const result = yield* workspaces.upsertForPath(body.path).pipe(
			Effect.map((workspace) => ({ workspace, reason: null as string | null })),
			Effect.catchTag("WorkspacePathUnresolved", (e) =>
				Effect.succeed({ workspace: null, reason: e.reason }),
			),
			Effect.catchTag("InternalError", (e) =>
				Effect.succeed({ workspace: null, reason: e.message }),
			),
		);
		return HttpServerResponse.jsonUnsafe(result);
	}).pipe(
		// Body-parse failures (bad JSON / missing `path`) land here; never let the
		// route reject — return a soft JSON error the caller can read.
		Effect.catchCause(() =>
			Effect.succeed(HttpServerResponse.jsonUnsafe({ workspace: null, reason: "bad request" })),
		),
	),
);

const Routes = Layer.mergeAll(HealthRoute, RpcRoute, WorkspaceUpsertRoute);

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
