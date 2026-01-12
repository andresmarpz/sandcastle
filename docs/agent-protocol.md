# Agent Protocol Architecture

This document describes Sandcastle's approach to AI agent integration: using the Vercel AI SDK protocol on the frontend with backend adapters that translate from various agent SDKs.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Why This Approach](#why-this-approach)
- [Components](#components)
- [Data Flow](#data-flow)
- [Adapter Pattern](#adapter-pattern)
- [Implementation Guide](#implementation-guide)
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

## Components

### 1. Claude Service (`apps/http/src/services/claude.service.ts`)

Manages Claude Agent SDK v1 sessions:

```typescript
export interface ClaudeSDKServiceInterface {
	readonly query: (
		prompt: string,
		options: QueryOptions,
	) => Effect.Effect<QueryHandle, ClaudeSDKError>;
}

export class ClaudeSDKService extends Context.Tag("ClaudeSDKService")<
	ClaudeSDKService,
	ClaudeSDKServiceInterface
>() {}
```

### 2. AI SDK Adapter

Translates Claude SDK messages to AI SDK format:

```typescript
// adapter/claude-to-ai-sdk.ts
export function adaptClaudeMessage(msg: SDKMessage): UIMessage {
  // Transform SDKMessage → UIMessage
}

export function adaptClaudeStream(
  stream: AsyncGenerator<SDKMessage>
): ReadableStream<Uint8Array> {
  // Transform stream to SSE with AI SDK events
}
```

### 3. Chat Transport

HTTP endpoint that streams AI SDK formatted responses:

```typescript
// routes/chat.ts
export const chatHandler = async (req: Request) => {
  const { sessionId, message } = await req.json();

  const session = await claudeService.resumeSession(sessionId);
  await claudeService.sendMessage(session, message);

  const stream = claudeService.streamResponse(session);
  const aiSdkStream = adaptClaudeStream(stream);

  return new Response(aiSdkStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'x-vercel-ai-ui-message-stream': 'v1'
    }
  });
};
```

### 4. Frontend (unchanged!)

Uses standard AI SDK hooks:

```typescript
// packages/ui/src/features/chat/chat.tsx
import { useChat } from '@ai-sdk/react';

function Chat() {
  const { messages, sendMessage, status } = useChat({
    api: '/api/chat'
  });

  return (
    <div>
      {messages.map(msg => (
        <Message key={msg.id} parts={msg.parts} />
      ))}
    </div>
  );
}
```

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

### Message Transformation Example

**Claude SDK SDKAssistantMessage:**

```typescript
{
  type: 'assistant',
  uuid: 'abc-123',
  session_id: 'session-456',
  message: {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Hello, how can I help?' },
      { type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: '/src/index.ts' } }
    ]
  }
}
```

**Adapted to AI SDK UIMessage:**

```typescript
{
  id: 'abc-123',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'Hello, how can I help?' },
    {
      type: 'tool-read_file',
      toolCallId: 'tool-1',
      toolName: 'read_file',
      args: { path: '/src/index.ts' },
      state: 'partial'
    }
  ]
}
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

## Implementation Guide

### Step 1: Create Claude Service

```typescript
// apps/http/src/services/claude.service.ts
import { Context, Effect, Stream } from 'effect';
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKMessage
} from '@anthropic-ai/claude-agent-sdk';

export interface ClaudeServiceImpl {
  createSession: (options: SessionOptions) => Effect.Effect<Session, ClaudeError>;
  resumeSession: (sessionId: string, options: SessionOptions) => Effect.Effect<Session, ClaudeError>;
  sendMessage: (session: Session, message: string) => Effect.Effect<void, ClaudeError>;
  streamResponse: (session: Session) => Stream.Stream<SDKMessage, ClaudeError>;
}

export class ClaudeService extends Context.Tag("ClaudeService")<
  ClaudeService,
  ClaudeServiceImpl
>() {}

// Implementation
export const ClaudeServiceLive = Layer.succeed(ClaudeService, {
  createSession: (options) => Effect.try(() => {
    return unstable_v2_createSession({
      model: options.model ?? 'claude-sonnet-4-5-20250929',
      ...options
    });
  }),

  resumeSession: (sessionId, options) => Effect.try(() => {
    return unstable_v2_resumeSession(sessionId, {
      model: options.model ?? 'claude-sonnet-4-5-20250929',
      ...options
    });
  }),

  sendMessage: (session, message) => Effect.promise(() =>
    session.send(message)
  ),

  streamResponse: (session) => Stream.fromAsyncIterable(
    session.stream(),
    (error) => new ClaudeError({ cause: error })
  )
});
```

### Step 2: Create Adapter

```typescript
// apps/http/src/adapters/claude.adapter.ts
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { UIMessage, UIMessagePart } from '@ai-sdk/react';

export function adaptClaudeMessageToUIMessage(msg: SDKMessage): UIMessage | null {
  if (msg.type === 'assistant') {
    return {
      id: msg.uuid,
      role: 'assistant',
      parts: adaptContentBlocks(msg.message.content)
    };
  }

  if (msg.type === 'user') {
    return {
      id: msg.uuid ?? crypto.randomUUID(),
      role: 'user',
      parts: adaptContentBlocks(msg.message.content)
    };
  }

  return null;
}

function adaptContentBlocks(content: ContentBlock[]): UIMessagePart[] {
  return content.flatMap(block => {
    switch (block.type) {
      case 'text':
        return [{ type: 'text' as const, text: block.text }];

      case 'tool_use':
        return [{
          type: `tool-${block.name}` as const,
          toolCallId: block.id,
          toolName: block.name,
          args: block.input as Record<string, unknown>,
          state: 'partial' as const
        }];

      case 'thinking':
        return [{ type: 'reasoning' as const, reasoning: block.thinking }];

      default:
        return [];
    }
  });
}

export function createAISDKStream(
  claudeStream: AsyncGenerator<SDKMessage>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let messageId: string | undefined;
      let textPartId = 0;

      try {
        for await (const msg of claudeStream) {
          const events = transformToStreamEvents(msg, () => {
            textPartId++;
            return `text_${textPartId}`;
          });

          if (msg.type === 'assistant' || msg.type === 'system') {
            messageId = msg.uuid;
          }

          for (const event of events) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          }
        }
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    }
  });
}

function transformToStreamEvents(
  msg: SDKMessage,
  getTextId: () => string
): StreamEvent[] {
  const events: StreamEvent[] = [];

  if (msg.type === 'assistant') {
    for (const block of msg.message.content) {
      if (block.type === 'text') {
        const id = getTextId();
        events.push({ type: 'text-start', id });
        events.push({ type: 'text-delta', id, delta: block.text });
        events.push({ type: 'text-end', id });
      }

      if (block.type === 'tool_use') {
        events.push({
          type: 'tool-input-start',
          toolCallId: block.id,
          toolName: block.name
        });
        events.push({
          type: 'tool-input-available',
          toolCallId: block.id,
          toolName: block.name,
          input: block.input
        });
      }
    }
  }

  if (msg.type === 'result') {
    events.push({
      type: 'finish',
      finishReason: msg.subtype === 'success' ? 'stop' : 'error'
    });
  }

  return events;
}
```

### Step 3: Create HTTP Handler

```typescript
// apps/http/src/handlers/chat.ts
import { Effect } from 'effect';
import { ClaudeService } from '../services/claude.service';
import { createAISDKStream } from '../adapters/claude.adapter';

export const chatHandler = Effect.gen(function* () {
  const claudeService = yield* ClaudeService;

  return async (req: Request) => {
    const { sessionId, message } = await req.json();

    // Resume or create session
    const session = sessionId
      ? yield* claudeService.resumeSession(sessionId, {})
      : yield* claudeService.createSession({});

    // Send user message
    yield* claudeService.sendMessage(session, message);

    // Create streaming response
    const claudeStream = yield* claudeService.streamResponse(session);
    const aiSdkStream = createAISDKStream(claudeStream);

    return new Response(aiSdkStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'x-vercel-ai-ui-message-stream': 'v1'
      }
    });
  };
});
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

### Unified Tool Protocol

Tools can be defined once and shared across agents:

```typescript
interface UnifiedTool {
  name: string;
  description: string;
  parameters: ZodSchema;
  execute: (args: unknown) => Promise<unknown>;
}

// Adapter transforms to agent-specific format
function toClaudeTool(tool: UnifiedTool): ClaudeToolDefinition { }
function toOpenCodeTool(tool: UnifiedTool): OpenCodeToolDefinition { }
```

### Multi-Agent Orchestration

```typescript
// Future: Route to different agents
const routeToAgent = (message: string) => {
  if (message.includes('code')) return 'claude';
  if (message.includes('search')) return 'perplexity';
  return 'default';
};
```

---

## Summary

| Concern | Solution |
|---------|----------|
| Frontend protocol | AI SDK v6 (UIMessage, parts, SSE) |
| Backend agent | Claude Agent SDK v2 (or any) |
| Translation | Adapter pattern |
| Streaming | SSE with AI SDK events |
| Extensibility | New adapter per agent |

The key insight: **The frontend never knows which agent is running**. It only knows AI SDK protocol. This makes the system modular, testable, and future-proof.
