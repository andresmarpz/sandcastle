import {
	HttpRouter,
	type HttpServerRequest,
	type HttpServerResponse,
} from "@effect/platform";
import { type RpcSerialization, RpcServer } from "@effect/rpc";
import { Context, Effect, Layer, Ref, type Scope } from "effect";

/**
 * Tracks WebSocket connection health and provides metrics for monitoring.
 */
export interface WebSocketMetrics {
	readonly activeConnections: Effect.Effect<number>;
	readonly totalConnections: Effect.Effect<number>;
	readonly incrementConnection: Effect.Effect<string>;
	readonly decrementConnection: (connectionId: string) => Effect.Effect<void>;
	readonly logError: (
		connectionId: string,
		error: unknown,
	) => Effect.Effect<void>;
	readonly getStats: Effect.Effect<{
		activeConnections: number;
		totalConnections: number;
	}>;
}

export class WebSocketMetricsService extends Context.Tag(
	"WebSocketMetricsService",
)<WebSocketMetricsService, WebSocketMetrics>() {}

interface MetricsState {
	activeConnections: number;
	totalConnections: number;
	connectionCounter: number;
}

const makeWebSocketMetrics = Effect.gen(function* () {
	const stateRef = yield* Ref.make<MetricsState>({
		activeConnections: 0,
		totalConnections: 0,
		connectionCounter: 0,
	});

	const generateConnectionId = (): Effect.Effect<string> =>
		Ref.modify(stateRef, (state) => {
			const id = `ws-${state.connectionCounter + 1}`;
			return [id, { ...state, connectionCounter: state.connectionCounter + 1 }];
		});

	const incrementConnection: Effect.Effect<string> = Effect.gen(function* () {
		const connectionId = yield* generateConnectionId();
		const timestamp = new Date().toISOString();

		yield* Ref.update(stateRef, (state) => ({
			...state,
			activeConnections: state.activeConnections + 1,
			totalConnections: state.totalConnections + 1,
		}));

		const stats = yield* Ref.get(stateRef);
		console.log(
			`[${timestamp}] WebSocket OPEN: ${connectionId} (active: ${stats.activeConnections}, total: ${stats.totalConnections})`,
		);

		return connectionId;
	});

	const decrementConnection = (connectionId: string): Effect.Effect<void> =>
		Effect.gen(function* () {
			const timestamp = new Date().toISOString();

			yield* Ref.update(stateRef, (state) => ({
				...state,
				activeConnections: Math.max(0, state.activeConnections - 1),
			}));

			const stats = yield* Ref.get(stateRef);
			console.log(
				`[${timestamp}] WebSocket CLOSE: ${connectionId} (active: ${stats.activeConnections}, total: ${stats.totalConnections})`,
			);
		});

	const logError = (
		connectionId: string,
		error: unknown,
	): Effect.Effect<void> =>
		Effect.sync(() => {
			const timestamp = new Date().toISOString();
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`[${timestamp}] WebSocket ERROR: ${connectionId} - ${errorMessage}`,
			);
		});

	const activeConnections: Effect.Effect<number> = Ref.get(stateRef).pipe(
		Effect.map((state) => state.activeConnections),
	);

	const totalConnections: Effect.Effect<number> = Ref.get(stateRef).pipe(
		Effect.map((state) => state.totalConnections),
	);

	const getStats: Effect.Effect<{
		activeConnections: number;
		totalConnections: number;
	}> = Ref.get(stateRef).pipe(
		Effect.map((state) => ({
			activeConnections: state.activeConnections,
			totalConnections: state.totalConnections,
		})),
	);

	return {
		activeConnections,
		totalConnections,
		incrementConnection,
		decrementConnection,
		logError,
		getStats,
	} satisfies WebSocketMetrics;
});

export const WebSocketMetricsLive = Layer.effect(
	WebSocketMetricsService,
	makeWebSocketMetrics,
);

/**
 * Creates a WebSocket protocol layer that tracks connection metrics.
 * Wraps the Effect RPC WebSocket protocol with our metrics tracking.
 */
export const makeProtocolWebsocketWithMetrics = (options: {
	readonly path: HttpRouter.PathInput;
}): Effect.Effect<
	RpcServer.Protocol["Type"],
	never,
	| RpcSerialization.RpcSerialization
	| HttpRouter.Default
	| WebSocketMetricsService
> =>
	Effect.gen(function* () {
		const metrics = yield* WebSocketMetricsService;
		const router = yield* HttpRouter.Default;

		// Get the base protocol with httpApp from Effect RPC
		const { httpApp, protocol } =
			yield* RpcServer.makeProtocolWithHttpAppWebsocket;

		// Create a wrapped httpApp that tracks connections
		const wrappedHttpApp = Effect.gen(function* () {
			const connectionId = yield* metrics.incrementConnection;

			// Add finalizer to track connection close
			yield* Effect.addFinalizer(() =>
				metrics.decrementConnection(connectionId),
			);

			// Upgrade the connection with error tracking
			const response = yield* httpApp.pipe(
				Effect.catchAllCause((cause) =>
					Effect.gen(function* () {
						yield* metrics.logError(connectionId, cause);
						return yield* Effect.fail(cause);
					}).pipe(Effect.sandbox, Effect.flip),
				),
			);

			return response;
		}).pipe(Effect.scoped);

		// Register the wrapped handler
		yield* router.get(
			options.path,
			wrappedHttpApp as Effect.Effect<
				HttpServerResponse.HttpServerResponse,
				never,
				HttpServerRequest.HttpServerRequest | Scope.Scope
			>,
		);

		return protocol;
	});

/**
 * Layer that provides the WebSocket RPC protocol with connection metrics.
 */
export const layerProtocolWebsocketWithMetrics = (options: {
	readonly path: HttpRouter.PathInput;
}): Layer.Layer<
	RpcServer.Protocol,
	never,
	RpcSerialization.RpcSerialization | WebSocketMetricsService
> =>
	Layer.effect(
		RpcServer.Protocol,
		makeProtocolWebsocketWithMetrics(options),
	).pipe(Layer.provide(HttpRouter.Default.Live));
