# Agent Protocol Architecture

This document describes Sandcastle's approach to AI agent integration: using the Vercel AI SDK protocol on the frontend with backend adapters that translate from various agent SDKs.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Why This Approach](#why-this-approach)
- [Data Flow](#data-flow)
- [Adapter Pattern](#adapter-pattern)
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
| Translation | Adapter pattern |
| Streaming | SSE with AI SDK events |
| Extensibility | New adapter per agent |

The key insight: **The frontend never knows which agent is running**. It only knows AI SDK protocol. This makes the system modular, testable, and future-proof.
