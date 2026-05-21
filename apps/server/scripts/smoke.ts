/**
 * Smoke test: open a WS to a running relay and exercise the workspace +
 * session CRUD surface.
 *
 *   pnpm -C apps/server start &           # in another shell
 *   bun apps/server/scripts/smoke.ts
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AbsolutePath, SandcastleRpc } from "@sandcastle/contracts";
import { Effect, Layer } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";

const URL = process.env.SANDCASTLE_URL ?? "ws://127.0.0.1:7421/rpc";

const program = Effect.gen(function* () {
	const client = yield* RpcClient.make(SandcastleRpc);

	const root = mkdtempSync(join(tmpdir(), "sandcastle-smoke-"));

	yield* Effect.logInfo(`creating workspace at ${root}`);
	const workspace = yield* client["workspaces.create"]({
		label: "smoke",
		path: AbsolutePath.make(root),
	});
	yield* Effect.logInfo(`created workspace ${workspace.id}`);

	const session = yield* client["sessions.create"]({
		workspaceId: workspace.id,
		title: "smoke session",
		worktreeMode: { _tag: "local" },
	});
	yield* Effect.logInfo(`created session ${session.id} (workdir=${session.workdir})`);

	const sessions = yield* client["sessions.list"]({ workspaceId: workspace.id });
	yield* Effect.logInfo(`workspace has ${sessions.length} session(s)`);

	const workspaces = yield* client["workspaces.list"]({});
	yield* Effect.logInfo(`server has ${workspaces.length} workspace(s)`);
});

const SocketLive = Socket.layerWebSocket(URL).pipe(
	Layer.provide(Socket.layerWebSocketConstructorGlobal),
);
const ProtocolLive = RpcClient.layerProtocolSocket().pipe(
	Layer.provide(RpcSerialization.layerJson),
	Layer.provide(SocketLive),
);

Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(ProtocolLive)))).catch((cause) => {
	console.error("smoke test failed", cause);
	process.exit(1);
});
