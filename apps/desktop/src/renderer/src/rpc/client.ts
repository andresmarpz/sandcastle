import { SandcastleRpc } from "@sandcastle/contracts";
import { Layer } from "effect";
import { AtomRpc } from "effect/unstable/reactivity";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";

const DEFAULT_URL = "ws://127.0.0.1:7421/rpc";

const url =
	(import.meta.env.VITE_SANDCASTLE_URL as string | undefined) ?? DEFAULT_URL;

const SocketLive = Socket.layerWebSocket(url).pipe(
	Layer.provide(Socket.layerWebSocketConstructorGlobal),
);

const ProtocolLive = RpcClient.layerProtocolSocket().pipe(
	Layer.provide(RpcSerialization.layerJson),
	Layer.provide(SocketLive),
);

/**
 * Atom-backed WS RPC client for the Sandcastle relay.
 *
 * `Client.mutation(tag)` exposes write-driven calls (fired when an atom is
 * set). `Client.query(tag, payload, opts?)` exposes cached reads + streams.
 * See `docs/rpc-contract.md` for the v0 surface.
 */
export class Client extends AtomRpc.Service<Client>()("SandcastleRpc", {
	group: SandcastleRpc,
	protocol: ProtocolLive,
}) {}
