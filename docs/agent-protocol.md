# Agent Protocol Architecture

This document describes Sandcastle's approach to AI agent integration: using the Vercel AI SDK protocol on the frontend with backend adapters that translate from various agent SDKs.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Why This Approach](#why-this-approach)
- [Data Flow](#data-flow)
- [Adapter Pattern](#adapter-pattern)
- [Stream Translation Deep Dive](#stream-translation-deep-dive)
- [Message Accumulation for Storage](#message-accumulation-for-storage)
- [Tool Call Correlation](#tool-call-correlation)
- [Mental Model](#mental-model)
- [Future Extensibility](#future-extensibility)

---

## Overview

Sandcastle uses a **protocol-first architecture** where:

1. **Frontend speaks AI SDK v6**: All UI components consume the Vercel AI SDK message format (`UIMessage` with `parts`)
2. **Backend adapts**: Adapters translate agent SDK responses to AI SDK format
3. **Agent-agnostic**: The frontend doesn't know or care which agent runs on the backend

This decoupling allows us to swap backend agents (Claude Agents SDK, OpenCode, Codex, etc.) without changing frontend code.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AI SDK v6 Protocol                        │   │
│  │  - UIMessage with parts[]                                    │   │
│  │  - useChat hook                                              │   │
│  │  - SSE streaming                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTP/SSE
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                           BACKEND                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   Adapter    │    │   Adapter    │    │   Adapter    │         │
│  │  (Claude)    │    │  (OpenCode)  │    │   (Codex)    │         │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘         │
│         │                   │                   │                  │
│  ┌──────▼───────┐    ┌──────▼───────┐    ┌──────▼───────┐         │
│  │ Claude Agent │    │   OpenCode   │    │    Codex     │         │
│  │    SDK v1    │    │     SDK      │    │     SDK      │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Layer Separation

| Layer | Responsibility | Protocol |
|-------|---------------|----------|
| **UI Components** | Render messages, handle input | React + UIMessage |
| **Chat State** | Manage conversation state | useChat / atoms |
| **Transport** | HTTP/SSE communication | AI SDK Stream Protocol |
| **Adapter** | Translate SDK → AI SDK format | SDK-specific |
| **Agent Service** | Manage agent sessions | SDK-specific |

### Protocol Boundary

The **AI SDK v6 protocol** is the contract between frontend and backend:

```typescript
// Frontend expects this format
interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: UIMessagePart[];
  metadata?: Record<string, unknown>;
}

// Stream protocol header
// x-vercel-ai-ui-message-stream: v1

// Stream events follow AI SDK specification
// data: {"type":"text-delta","id":"...","delta":"Hello"}
```

Everything below this boundary is backend implementation detail.

---

## Why This Approach

### Problem with Direct SDK Integration

The previous approach tightly coupled the frontend to Claude Agent SDK v1:

```
❌ Frontend → Claude SDK v1 types → Claude SDK v1 streaming → UI
```

Issues:

- Hard to change agents (locked to Claude)
- Frontend needed SDK-specific knowledge
- Breaking changes in SDK rippled to UI
- Testing required real agent

### Solution: Protocol Adapter Pattern

```
✓ Frontend → AI SDK Protocol → Adapter → Any Agent SDK
```

Benefits:

| Benefit | Description |
|---------|-------------|
| **Decoupling** | Frontend knows nothing about backend agent |
| **Swappability** | Change agents by switching adapters |
| **Testability** | Mock adapter returns AI SDK format |
| **Ecosystem** | Use AI SDK's battle-tested UI components |
| **Future-proof** | New agents just need new adapter |

---

## Data Flow

### Send Message Flow

```
1. User types message
   │
2. useChat.sendMessage({ content: "Hello" })
   │
3. POST /api/chat { sessionId, message: "Hello" }
   │
4. ClaudeService.sendMessage(session, "Hello")
   │
5. Claude Agent SDK v1 query
```

### Receive Response Flow

```
1. Claude Agent SDK streams SDKMessage
   │
2. Adapter transforms to AI SDK events:
   │  SDKAssistantMessage → text-start, text-delta, text-end
   │  SDKResultMessage → finish
   │
3. SSE stream with AI SDK protocol
   │  data: {"type":"text-delta","delta":"Hello"}
   │
4. useChat receives and updates messages[]
   │
5. UI re-renders with new parts
```

---

## Adapter Pattern

### Adapter Interface

Each agent SDK needs an adapter implementing:

```typescript
interface AgentAdapter {
  // Transform a complete message
  adaptMessage(msg: AgentMessage): UIMessage;

  // Transform streaming response to AI SDK stream
  adaptStream(stream: AsyncIterable<AgentMessage>): ReadableStream<Uint8Array>;

  // Transform user input to agent format
  adaptUserMessage(message: string, attachments?: File[]): AgentInput;
}
```

### Claude Adapter Implementation

```typescript
// adapters/claude.adapter.ts
export class ClaudeAdapter implements AgentAdapter {
  adaptMessage(msg: SDKMessage): UIMessage {
    switch (msg.type) {
      case 'assistant':
        return {
          id: msg.uuid,
          role: 'assistant',
          parts: this.adaptContent(msg.message.content)
        };
      case 'result':
        // Handle final result
      // ...
    }
  }

  private adaptContent(content: ContentBlock[]): UIMessagePart[] {
    return content.map(block => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text };
        case 'tool_use':
          return {
            type: `tool-${block.name}`,
            toolCallId: block.id,
            toolName: block.name,
            args: block.input,
            state: 'partial'
          };
        case 'thinking':
          return { type: 'reasoning', reasoning: block.thinking };
      }
    });
  }

  adaptStream(stream: AsyncGenerator<SDKMessage>): ReadableStream {
    return new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        for await (const msg of stream) {
          const events = this.toStreamEvents(msg);
          for (const event of events) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
  }
}
```

### Adding a New Agent

To add support for a new agent (e.g., OpenCode):

```typescript
// adapters/opencode.adapter.ts
export class OpenCodeAdapter implements AgentAdapter {
  adaptMessage(msg: OpenCodeMessage): UIMessage {
    // Transform OpenCode format to UIMessage
  }

  adaptStream(stream: AsyncIterable<OpenCodeEvent>): ReadableStream {
    // Transform OpenCode events to AI SDK stream
  }
}

// services/opencode.service.ts
export class OpenCodeService extends Context.Tag("OpenCodeService")<...>() {}

// Register in dependency injection
const AgentService = process.env.AGENT === 'opencode'
  ? OpenCodeService
  : ClaudeService;
```

---

## Stream Translation Deep Dive

The adapter performs a critical transformation: **exploding** complete SDK messages into granular stream events that the AI SDK frontend expects.

### The Key Insight

Agent SDKs like Claude's emit **complete thoughts** - whole messages with all content blocks assembled. The AI SDK expects **granular events** for real-time UI updates.

```
Agent SDK Output (complete messages):
┌─────────────────────────────────────────────────────────────────────┐
│ SDKAssistantMessage                                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ content: [                                                      │ │
│ │   { type: "thinking", thinking: "Let me analyze..." },          │ │
│ │   { type: "text", text: "I'll help you with that." },           │ │
│ │   { type: "tool_use", id: "t1", name: "Read", input: {...} }    │ │
│ │ ]                                                               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ EXPLODE
                                    ▼
AI SDK Stream Events (granular):
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ reasoning-start  │ │ reasoning-delta  │ │ reasoning-end    │
│ id: "r1"         │ │ id: "r1"         │ │ id: "r1"         │
│                  │ │ delta: "Let me"  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ text-start       │ │ text-delta       │ │ text-end         │
│ id: "t1"         │ │ id: "t1"         │ │ id: "t1"         │
│                  │ │ delta: "I'll..." │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────────────────────────────┐
│ tool-input-start │ │ tool-input-available                     │
│ toolCallId: "t1" │ │ toolCallId: "t1", toolName: "Read"       │
│ toolName: "Read" │ │ input: { file_path: "/src/index.ts" }    │
└──────────────────┘ └──────────────────────────────────────────┘
```

### Why Explode Messages?

The AI SDK frontend (`useChat`) expects this granular protocol because:

1. **Real-time UI**: Each delta renders immediately (typing effect)
2. **Part lifecycle**: Start/delta/end events let the UI show loading states
3. **Incremental updates**: Frontend builds `UIMessage.parts[]` progressively
4. **Tool states**: Tool parts transition through states (pending → available → output)

### Content Block to Stream Event Mapping

| SDK Content Block | Stream Events Emitted |
|-------------------|----------------------|
| `{ type: "text", text: "..." }` | `text-start` → `text-delta` → `text-end` |
| `{ type: "thinking", thinking: "..." }` | `reasoning-start` → `reasoning-delta` → `reasoning-end` |
| `{ type: "tool_use", id, name, input }` | `tool-input-start` → `tool-input-available` |
| `{ type: "tool_result", tool_use_id, content }` | `tool-output-available` or `tool-output-error` |

### SDK Message Type to Events

| SDK Message Type | Events Emitted |
|-----------------|----------------|
| `system.init` | `start` (with session info) |
| `assistant` | Content block events (text, reasoning, tool) |
| `user` (with tool_result) | `tool-output-available` / `tool-output-error` |
| `result.success` | `finish` (with metadata: cost, tokens) |
| `result.error_*` | `finish` (with error reason) |

### Implementation: The Stream Transformer

Located at `apps/http/src/adapters/claude/transformer.ts`:

```typescript
// One SDKMessage can produce MANY stream events
function processMessage(
  message: SDKMessage,
  state: StreamState,
  config: AdapterConfig,
): { events: ChatStreamEvent[]; newState: StreamState } {
  const events: ChatStreamEvent[] = [];

  switch (message.type) {
    case "assistant":
      // Process each content block
      for (const block of message.message.content) {
        if (block.type === "text") {
          const id = config.generateId();
          events.push(new StreamEventTextStart({ type: "text-start", id }));
          events.push(new StreamEventTextDelta({ type: "text-delta", id, delta: block.text }));
          events.push(new StreamEventTextEnd({ type: "text-end", id }));
        }
        // ... similar for thinking, tool_use
      }
      break;
    // ...
  }

  return { events, newState };
}
```

### The Effect.js Pipeline

The adapter uses `Stream.mapConcatEffect` to flatten:

```typescript
sdkStream.pipe(
  Stream.mapConcatEffect((message) =>
    Effect.sync(() => {
      const result = processMessage(message, state, config);
      state = result.newState;
      return Chunk.fromIterable(result.events);  // 1 message → N events
    }),
  ),
)
```

---

## Message Accumulation for Storage

While stream events power real-time UI, we also need **complete messages** for storage. This is the dual-path architecture:

```
                         SDKMessage Stream
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
    ┌─────────────────────┐          ┌─────────────────────┐
    │  Stream Transformer │          │  Message Accumulator │
    │  (for real-time UI) │          │    (for storage)     │
    └──────────┬──────────┘          └──────────┬──────────┘
               │                                │
               ▼                                ▼
    ┌─────────────────────┐          ┌─────────────────────┐
    │  ChatStreamEvent[]  │          │    ChatMessage[]    │
    │  (send to client)   │          │  (save to SQLite)   │
    └─────────────────────┘          └─────────────────────┘
```

### Why Two Paths?

| Concern | Stream Transformer | Message Accumulator |
|---------|-------------------|---------------------|
| Purpose | Real-time UI updates | Persistent storage |
| Output | Granular events | Complete messages |
| Format | `ChatStreamEvent[]` | `ChatMessage[]` (UIMessage compatible) |
| Timing | Emit immediately | Collect until stream ends |

### The Accumulator Pattern

Located at `apps/http/src/adapters/claude/message-accumulator.ts`:

```typescript
interface MessageAccumulator {
  process(message: SDKMessage): void;
  getMessages(): ChatMessage[];
  getSessionMetadata(): SessionMetadata | null;
  getClaudeSessionId(): string | null;
}

// Usage
const accumulator = createMessageAccumulator({
  generateId: () => crypto.randomUUID(),
  storageSessionId: "your-session-id"
});

for await (const sdkMessage of claudeStream) {
  accumulator.process(sdkMessage);
}

// After stream completes
const messages = accumulator.getMessages();    // Save to DB
const metadata = accumulator.getSessionMetadata();  // Cost, tokens, etc.
```

### SDKMessage to ChatMessage Mapping

| SDKMessage Type | ChatMessage Action |
|-----------------|-------------------|
| `system.init` | No message (store session ID internally) |
| `assistant` | CREATE `{ role: "assistant", parts: [...] }` |
| `user` (tool_result only) | UPDATE existing assistant's ToolCallPart |
| `user` (with text) | CREATE `{ role: "user", parts: [...] }` |
| `result` | No message (extract session metadata) |

### Content Block to MessagePart Mapping

| SDK Content Block | MessagePart Type |
|-------------------|------------------|
| `{ type: "text", text }` | `TextPart { type: "text", text, state: "done" }` |
| `{ type: "thinking", thinking }` | `ReasoningPart { type: "reasoning", text, state: "done" }` |
| `{ type: "tool_use", id, name, input }` | `ToolCallPart { type: "tool-{name}", state: "input-available", ... }` |

---

## Tool Call Correlation

The trickiest part of the adapter is **tool call correlation**: matching `tool_use` in assistant messages with `tool_result` in user messages.

### The Challenge

```
SDKMessage 1 (assistant):
┌──────────────────────────────────────────────────────┐
│ content: [                                           │
│   { type: "tool_use", id: "call_abc", name: "Read" } │
│ ]                                                    │
└──────────────────────────────────────────────────────┘

SDKMessage 2 (user):
┌──────────────────────────────────────────────────────┐
│ content: [                                           │
│   { type: "tool_result", tool_use_id: "call_abc",    │
│     content: "file contents..." }                    │
│ ]                                                    │
└──────────────────────────────────────────────────────┘
```

The `tool_result` in the **user** message must update the `tool_use` in the **assistant** message.

### State Tracking Solution

Both the stream transformer and message accumulator maintain state to correlate tool calls:

```typescript
// Track pending tool calls
const pendingToolCalls = new Map<string, {
  messageIndex: number;  // Which ChatMessage
  partIndex: number;     // Which part in that message
}>();

// When tool_use is encountered
pendingToolCalls.set(toolBlock.id, { messageIndex: 0, partIndex: 2 });

// When tool_result arrives
const location = pendingToolCalls.get(result.tool_use_id);
messages[location.messageIndex].parts[location.partIndex].state = "output-available";
messages[location.messageIndex].parts[location.partIndex].output = result.content;
```

### Tool Part State Transitions

```
tool_use in assistant message    →    state: "input-available"
                                           │
                                           ▼
tool_result (success)            →    state: "output-available"
                                           │
                                      output: "..."

tool_result (is_error: true)     →    state: "output-error"
                                           │
                                      errorText: "..."
```

### Multiple Tool Calls

An assistant message can have multiple tool calls, all tracked independently:

```
Assistant Message:
├── TextPart: "Let me read both files"
├── ToolCallPart: { toolCallId: "t1", state: "input-available" }  ← tracked
└── ToolCallPart: { toolCallId: "t2", state: "input-available" }  ← tracked

After User Message with tool_results:
├── TextPart: "Let me read both files"
├── ToolCallPart: { toolCallId: "t1", state: "output-available", output: "..." }
└── ToolCallPart: { toolCallId: "t2", state: "output-error", errorText: "..." }
```

---

## Mental Model

### Think of It Like Translation

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENT WORLD                                  │
│                                                                     │
│  Claude speaks: SDKMessage (complete thoughts, tool calls, results) │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │  ADAPTER (translator)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        AI SDK WORLD                                 │
│                                                                     │
│  Frontend understands:                                              │
│  - ChatStreamEvent (for real-time updates)                          │
│  - ChatMessage/UIMessage (for state and storage)                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### The Dual Output Model

When processing an agent stream, always think in two outputs:

| Output | Purpose | Consumer |
|--------|---------|----------|
| **Stream Events** | Real-time UI updates | SSE → useChat → React |
| **Accumulated Messages** | Persistent storage | SQLite → initialMessages → useChat |

### Session ID Duality

There are **two session IDs** in play:

| ID | Owner | Purpose |
|----|-------|---------|
| `storageSessionId` | Your system | Primary key in your DB, groups messages |
| `claudeSessionId` | Claude SDK | Resume capability, cost tracking |

The adapter extracts `claudeSessionId` and stores it as metadata on your session.

### The Frontend Doesn't Care

The entire point of this architecture:

```typescript
// Frontend code - agent agnostic
const { messages, sendMessage } = useChat({
  api: "/api/chat",
  initialMessages: await fetchStoredMessages(sessionId),
});

// Works the same whether backend uses:
// - Claude Agents SDK
// - OpenCode
// - Custom agent
// - Mock adapter for testing
```

---

## Future Extensibility

### Adding More Agents

The architecture supports any agent that can:

1. Send messages
2. Stream responses
3. Have sessions/conversations

Potential agents:

- **OpenCode** - Open source AI coding assistant
- **Codex** - OpenAI's code model
- **Custom agents** - Local LLMs with tool use
- **Multi-agent** - Route to different agents per task

---

## Summary

| Concern | Solution |
|---------|----------|
| Frontend protocol | AI SDK v6 (UIMessage, parts, SSE) |
| Backend agent | Claude Agent SDK v1 (or any) |
| Real-time streaming | Stream Transformer → ChatStreamEvent[] |
| Storage | Message Accumulator → ChatMessage[] |
| Tool correlation | State tracking with Map<toolCallId, location> |
| Session identity | Storage session ID + Claude session ID (metadata) |
| Extensibility | New adapter per agent |

### Key Insights

1. **The frontend never knows which agent is running**. It only knows AI SDK protocol.

2. **One SDK message produces many stream events**. The adapter "explodes" complete messages into granular events for real-time UI.

3. **Two outputs, one input**. Every SDK message is processed twice: once for streaming, once for storage.

4. **Tool results cross message boundaries**. State tracking is essential to correlate tool_use with tool_result.

5. **Storage is agent-agnostic**. ChatMessage format works regardless of which agent produced it.

This architecture is modular, testable, and future-proof.
