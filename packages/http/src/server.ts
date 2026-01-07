import { HttpRouter } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { Layer } from "effect";

import { WorktreeRpc, WorktreeRpcHandlersLive } from "@sandcastle/rpc";

// CORS headers
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, b3, traceparent, tracestate",
  "Access-Control-Max-Age": "86400"
};

// Create the RPC server layer
const RpcLayer = RpcServer.layer(WorktreeRpc).pipe(Layer.provide(WorktreeRpcHandlersLive));

// HTTP protocol with NDJSON serialization
const HttpProtocol = RpcServer.layerProtocolHttp({
  path: "/rpc"
}).pipe(Layer.provide(RpcSerialization.layerNdjson));

// Port from environment or default to 3000
const port = Number(process.env.PORT) || 3000;
const internalPort = port + 1;

// Export configurable server layer (for internal use)
export const makeServerLayer = (listenPort: number) =>
  HttpRouter.Default.serve().pipe(
    Layer.provide(RpcLayer),
    Layer.provide(HttpProtocol),
    Layer.provide(BunHttpServer.layer({ port: listenPort }))
  );

// Default server layer (internal)
export const ServerLive = makeServerLayer(internalPort);

// Start internal Effect server
BunRuntime.runMain(Layer.launch(ServerLive));

// Start external CORS proxy on main port
Bun.serve({
  port,
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Proxy to internal Effect server
    const url = new URL(request.url);
    url.port = String(internalPort);

    const proxyResponse = await fetch(
      new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        duplex: "half"
      })
    );

    // Add CORS headers to response
    const newHeaders = new Headers(proxyResponse.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }

    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: newHeaders
    });
  }
});

console.log(
  `CORS proxy on http://localhost:${port}, Effect server on http://localhost:${internalPort}`
);
