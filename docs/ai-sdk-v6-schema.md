# Vercel AI SDK v6 Schema and Protocol

This document provides comprehensive technical documentation for the Vercel AI SDK v6 message schema, streaming protocol, and frontend integration. It serves as a reference for implementing adapters that translate other SDK formats to the AI SDK format.

## Table of Contents

- [Overview](#overview)
- [Message Schema](#message-schema)
- [UIMessage Type](#uimessage-type)
- [Message Part Types](#message-part-types)
- [Streaming Protocol](#streaming-protocol)
- [Frontend Hooks](#frontend-hooks)
- [Tool Calling](#tool-calling)
- [Multimodal Content](#multimodal-content)
- [Backend Integration](#backend-integration)
- [Type Conversions](#type-conversions)

---

## Overview

The Vercel AI SDK v6 provides a unified interface for building AI-powered applications. Key concepts:

- **UIMessage**: The source of truth for frontend state, containing messages with parts
- **Parts-based structure**: Messages contain typed parts (text, tool calls, reasoning, etc.)
- **SSE Streaming**: Server-Sent Events protocol for real-time streaming
- **Type-safe hooks**: `useChat`, `useCompletion`, `useObject` for React integration

---

## Message Schema

### Core Message Roles

Messages support these primary roles:

| Role | Description |
|------|-------------|
| `user` | Messages from the user |
| `assistant` | Responses from the AI model |
| `system` | System instructions/context |
| `tool` | Tool execution results |

### CoreMessage Structure

For model communication:

```typescript
interface CoreMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | CoreMessagePart[];
  providerOptions?: Record<string, unknown>;
}
```

---

## UIMessage Type

UIMessage is the primary representation for frontend state management:

```typescript
interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  createdAt?: Date;
  parts: UIMessagePart[];
  metadata?: Record<string, unknown>;
  experimental_attachments?: Attachment[];
}

interface Attachment {
  url: string;
  contentType: string;
  name?: string;
}
```

UIMessage is the single source of truth containing:
- Complete message history
- All metadata
- Tool results
- Data parts
- Full contextual information for UI rendering

---

## Message Part Types

The `parts` array can contain various part types:

### TextUIPart

```typescript
interface TextUIPart {
  type: 'text';
  text: string;
}
```

### ToolCallUIPart

Tool calls use type-specific identifiers:

```typescript
interface ToolCallUIPart {
  type: `tool-${string}`;  // e.g., 'tool-getWeather'
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'partial' | 'result' | 'error';
  result?: unknown;
}
```

### ToolResultUIPart

```typescript
interface ToolResultUIPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}
```

### ReasoningUIPart

For models with reasoning capabilities (OpenAI o1, Claude thinking):

```typescript
interface ReasoningUIPart {
  type: 'reasoning';
  reasoning: string;
}
```

### ImageUIPart

```typescript
interface ImageUIPart {
  type: 'image';
  image: string | Uint8Array;  // base64 or binary
  mimeType?: string;
}
```

### FileUIPart

```typescript
interface FileUIPart {
  type: 'file';
  data: string | Uint8Array | Buffer;
  mimeType: string;
  filename?: string;
}
```

### SourceUIPart

```typescript
interface SourceUIPart {
  type: 'source';
  source: {
    title: string;
    url: string;
  };
}
```

### DataUIPart

Custom data parts with type-specific identifiers:

```typescript
interface DataUIPart {
  type: `data-${string}`;  // e.g., 'data-weather'
  id?: string;
  data: unknown;
}
```

---

## Streaming Protocol

### Protocol Overview

- Uses **Server-Sent Events (SSE)** format
- Required header: `x-vercel-ai-ui-message-stream: v1`
- Response format: JSON objects in SSE data frames
- Ends with `data: [DONE]`

### Stream Event Format

Each event follows SSE format:

```
data: {"type":"EVENT_TYPE","id":"UNIQUE_ID",...}\n\n
```

### Stream Event Types

#### Message Lifecycle Events

```typescript
// Message start
{ "type": "start", "messageId": "msg_abc123" }

// Message finish
{
  "type": "finish",
  "finishReason": "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"
}

// Step boundaries
{ "type": "start-step" }
{ "type": "finish-step" }

// Stream termination
{ "type": "abort", "reason": "user cancelled" }
```

#### Text Streaming (Start/Delta/End Pattern)

```typescript
// Text start
{ "type": "text-start", "id": "text_xyz789" }

// Text delta (multiple)
{ "type": "text-delta", "id": "text_xyz789", "delta": "Hello" }
{ "type": "text-delta", "id": "text_xyz789", "delta": " world" }

// Text end
{ "type": "text-end", "id": "text_xyz789" }
```

#### Reasoning Streaming

```typescript
{ "type": "reasoning-start", "id": "reasoning_abc" }
{ "type": "reasoning-delta", "id": "reasoning_abc", "delta": "Let me think..." }
{ "type": "reasoning-end", "id": "reasoning_abc" }
```

#### Tool Streaming

```typescript
// Tool input streaming
{
  "type": "tool-input-start",
  "toolCallId": "call_123",
  "toolName": "getWeather"
}

{
  "type": "tool-input-delta",
  "toolCallId": "call_123",
  "inputTextDelta": "{\"location\""
}

// Tool input ready (parsed)
{
  "type": "tool-input-available",
  "toolCallId": "call_123",
  "toolName": "getWeather",
  "input": { "location": "San Francisco" }
}

// Tool output
{
  "type": "tool-output-available",
  "toolCallId": "call_123",
  "output": { "temperature": 72, "condition": "sunny" }
}
```

#### Source and File Events

```typescript
// Source URL
{
  "type": "source-url",
  "sourceId": "source_001",
  "url": "https://example.com"
}

// Source document
{
  "type": "source-document",
  "sourceId": "source_002",
  "mediaType": "application/pdf",
  "title": "Document Title"
}

// File
{
  "type": "file",
  "url": "https://example.com/image.png",
  "mediaType": "image/png"
}
```

#### Custom Data Events

```typescript
{
  "type": "data-weather",
  "data": { "temperature": 72, "humidity": 45 }
}
```

#### Error Event

```typescript
{ "type": "error", "errorText": "Something went wrong" }
```

### Complete Stream Example

```
data: {"type":"start","messageId":"msg_001"}

data: {"type":"text-start","id":"text_001"}

data: {"type":"text-delta","id":"text_001","delta":"Hello"}

data: {"type":"text-delta","id":"text_001","delta":", how can I help?"}

data: {"type":"text-end","id":"text_001"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]
```

---

## Frontend Hooks

### useChat Hook

```typescript
import { useChat } from '@ai-sdk/react'

const {
  messages,
  sendMessage,
  status,
  error,
  stop,
  regenerate,
  setMessages,
  addToolOutput,
  resumeStream,
  clearError
} = useChat({
  // Configuration
  id?: string,
  messages?: UIMessage[],
  transport?: ChatTransport,

  // Callbacks
  onToolCall?: ({ toolCall }) => void | Promise<void>,
  onFinish?: (options: OnFinishOptions) => void,
  onError?: (error: Error) => void,
  onData?: (dataPart: DataUIPart) => void,

  // Options
  sendAutomaticallyWhen?: ({ messages }) => boolean,
  experimental_throttle?: number,
  resume?: boolean
})
```

### Hook Return Values

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Chat session identifier |
| `messages` | `UIMessage[]` | Current conversation array |
| `status` | `'submitted' \| 'streaming' \| 'ready' \| 'error'` | Current state |
| `error` | `Error \| undefined` | Last error |
| `sendMessage()` | `(message: CreateUIMessage \| string, options?) => void` | Submit message |
| `regenerate()` | `(options?: { messageId? }) => void` | Resend response |
| `stop()` | `() => void` | Halt streaming |
| `clearError()` | `() => void` | Reset error state |
| `resumeStream()` | `() => void` | Reconnect stream |
| `addToolOutput()` | `(options: ToolOutputOptions) => void` | Provide tool results |
| `setMessages()` | `(messages \| updateFn) => void` | Update state |

### OnFinishOptions

```typescript
interface OnFinishOptions {
  message: UIMessage;
  messages: UIMessage[];
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
}
```

### ChatRequestOptions

```typescript
interface ChatRequestOptions {
  headers?: Record<string, string> | Headers;
  body?: object;
  metadata?: JSONValue;
}
```

---

## Tool Calling

### Tool Definition

```typescript
const weatherTool = {
  description: 'Get weather information',
  parameters: z.object({
    location: z.string()
  }),
  execute: async ({ location }, context: {
    toolCallId: string;
    messages: UIMessage[];
    abortSignal: AbortSignal;
  }) => {
    return { temperature: 72, condition: 'sunny' }
  }
}
```

### Tool Call Lifecycle

1. **Assistant generates tool call**: Part with `type: 'tool-TOOLNAME'` added
2. **Stream events**: `tool-input-start` → `tool-input-delta` → `tool-input-available`
3. **Tool executes**: Backend runs tool
4. **Result streamed**: `tool-output-available` event
5. **Frontend updates**: `addToolOutput()` or automatic update

### Adding Tool Results

```typescript
addToolOutput({
  toolCallId: 'call_abc123',
  toolName: 'getWeather',
  result: { temperature: 72 }
})
```

---

## Multimodal Content

### Attachments in useChat

```typescript
// FileList from input
handleSubmit(event, {
  experimental_attachments: fileInput.files
})

// Array of URLs
handleSubmit(event, {
  experimental_attachments: [
    'https://example.com/image.jpg',
    'data:image/png;base64,...'
  ]
})
```

### Message with Attachments

```typescript
const messageWithAttachments: UIMessage = {
  id: 'msg_123',
  role: 'user',
  parts: [
    { type: 'text', text: "What's in this image?" },
    {
      type: 'image',
      image: 'data:image/png;base64,...',
      mimeType: 'image/png'
    }
  ],
  experimental_attachments: [
    {
      url: 'data:image/png;base64,...',
      contentType: 'image/png',
      name: 'screenshot.png'
    }
  ]
}
```

### Supported Formats

**Images**: JPEG, PNG, WebP, GIF → `ImageUIPart`
**Files**: PDF, documents → `FileUIPart`

---

## Backend Integration

### Server-Side with streamText

```typescript
import { streamText } from 'ai'

const result = await streamText({
  model,
  messages,
  tools: { /* ... */ }
})

return result.toUIMessageStreamResponse()
```

### Custom Backend Headers

```
x-vercel-ai-ui-message-stream: v1
Content-Type: text/event-stream
```

### Response Methods

| Method | Description |
|--------|-------------|
| `toUIMessageStreamResponse()` | Full data stream with parts |
| `toTextStreamResponse()` | Simple text-only stream |
| `toDataStreamResponse()` | Legacy data stream |

---

## Type Conversions

### UIMessage to ModelMessage

```typescript
import { convertToModelMessages } from 'ai'

const modelMessages = convertToModelMessages(uiMessages)
```

### ModelMessage Structure

```typescript
interface ModelMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ModelMessagePart[];
}

// ModelMessagePart can be:
// - TextPart
// - ImagePart
// - ToolCallPart
// - ToolResultPart
// - ReasoningPart
```

### Type-Safe Generics

```typescript
const { messages } = useChat<
  CustomMetadata,
  CustomDataParts,
  ToolDefinitions
>()
```

---

## Implementation Notes for Adapters

When creating adapters to translate other SDK formats to AI SDK v6:

### Message Transformation

1. Generate unique `id` for each message
2. Set `createdAt` timestamp
3. Convert content to appropriate `parts` array
4. Preserve metadata

### Part Type Mapping

| Source Type | AI SDK Part Type |
|-------------|------------------|
| Text content | `TextUIPart` |
| Tool call | `ToolCallUIPart` (`type: 'tool-{name}'`) |
| Tool result | `ToolResultUIPart` |
| Image | `ImageUIPart` |
| File | `FileUIPart` |
| Thinking/reasoning | `ReasoningUIPart` |
| References/sources | `SourceUIPart` |

### Streaming Implementation

1. Set header: `x-vercel-ai-ui-message-stream: v1`
2. Use SSE format with JSON objects
3. Follow start/delta/end pattern for text
4. End stream with `data: [DONE]`

### Tool Handling

1. Use tool-specific type identifiers: `tool-{toolName}`
2. Stream tool input incrementally
3. Emit `tool-input-available` when parsed
4. Emit `tool-output-available` with results

---

## References

- [AI SDK Documentation](https://ai-sdk.dev/docs)
- [AI SDK UI: Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [AI SDK Core: streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [AI SDK UI: useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [AI SDK 6 Blog Post](https://vercel.com/blog/ai-sdk-6)
- [Vercel AI SDK GitHub](https://github.com/vercel/ai)
