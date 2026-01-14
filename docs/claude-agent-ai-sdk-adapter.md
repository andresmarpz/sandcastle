# Claude Agents SDK to AI SDK Adapter Reference

This document provides a comprehensive guide for translating Claude Agents SDK outputs into AI SDK-compatible formats for use with `@ai-sdk/react`.

## Table of Contents

1. [Overview](#overview)
2. [Anthropic SDK Types Reference](#anthropic-sdk-types-reference)
3. [Core Type Mappings](#core-type-mappings)
4. [SDKMessage Transformations](#sdkmessage-transformations)
5. [Tool Call Transformations](#tool-call-transformations)
6. [Streaming Transformations](#streaming-transformations)
7. [Content Block Transformations](#content-block-transformations)
8. [Complete Adapter Implementation](#complete-adapter-implementation)
9. [Edge Cases and Special Handling](#edge-cases-and-special-handling)
10. [Bidirectional Communication](#bidirectional-communication)
11. [Complete UIMessageChunk Reference](#complete-uimessagechunk-reference)
12. [Summary: Quick Reference Tables](#summary-quick-reference-tables)

---

## Overview

### Source: Claude Agents SDK

The Claude Agents SDK produces messages via an async generator returning `SDKMessage`:

```typescript
type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKCompactBoundaryMessage;
```

### Target: AI SDK

The AI SDK expects `UIMessage` with parts:

```typescript
interface UIMessage<METADATA, DATA_PARTS, TOOLS> {
  id: string;
  role: 'system' | 'user' | 'assistant';
  metadata?: METADATA;
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}
```

### Key Differences

| Aspect | Claude Agents SDK | AI SDK |
| ------ | ----------------- | ------ |
| Message structure | `message.content` array with content blocks | `parts` array with UI parts |
| Tool representation | `tool_use` blocks in content | `tool-{name}` or `dynamic-tool` parts |
| Streaming | `SDKPartialAssistantMessage` with `RawMessageStreamEvent` | `UIMessageChunk` events |
| Thinking | `thinking` content blocks | `reasoning` parts |
| System info | `SDKSystemMessage` with init data | Custom `data-*` parts |

---

## Anthropic SDK Types Reference

The Claude Agents SDK wraps the Anthropic API. These are the key types from `@anthropic-ai/sdk` that you'll encounter:

### Content Blocks (in messages)

```typescript
// Text content
type TextBlock = {
  type: 'text';
  text: string;
};

// Thinking/reasoning (extended thinking feature)
type ThinkingBlock = {
  type: 'thinking';
  thinking: string;
};

// Tool invocation
type ToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

// Tool result (in user messages)
type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<TextBlock | ImageBlock>;
  is_error?: boolean;
};

// Image content
type ImageBlock = {
  type: 'image';
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string };
};

type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock;
```

### Stream Events (RawMessageStreamEvent)

```typescript
type RawMessageStreamEvent =
  | { type: 'message_start'; message: Message }
  | { type: 'message_delta'; delta: { stop_reason?: string }; usage: Usage }
  | { type: 'message_stop' }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentBlockDelta }
  | { type: 'content_block_stop'; index: number };

type ContentBlockDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'input_json_delta'; partial_json: string };
```

### Usage Statistics

```typescript
type Usage = {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};
```

---

## Core Type Mappings

### Message Role Mapping

| Claude Agents SDK | AI SDK |
| ----------------- | ------ |
| `type: 'assistant'` | `role: 'assistant'` |
| `type: 'user'` | `role: 'user'` |
| `type: 'system'` (init) | Custom data part or metadata |
| `type: 'result'` | Metadata on last assistant message |

### Content Block to Part Mapping

| Claude SDK Content Block | AI SDK Part Type |
| ------------------------ | ---------------- |
| `type: 'text'` | `TextUIPart` |
| `type: 'thinking'` | `ReasoningUIPart` |
| `type: 'tool_use'` | `ToolUIPart` or `DynamicToolUIPart` |
| `type: 'tool_result'` | Updates existing tool part state |
| `type: 'image'` | `FileUIPart` |

---

## SDKMessage Transformations

### SDKAssistantMessage → UIMessage

**Source:**
```typescript
type SDKAssistantMessage = {
  type: 'assistant';
  uuid: UUID;
  session_id: string;
  message: {
    role: 'assistant';
    content: Array<TextBlock | ToolUseBlock | ThinkingBlock>;
    model: string;
    stop_reason: string;
    usage: Usage;
  };
  parent_tool_use_id: string | null;
}
```

**Target:**
```typescript
interface UIMessage {
  id: string;           // from uuid
  role: 'assistant';
  metadata?: {
    sessionId: string;
    model: string;
    stopReason: string;
    usage: LanguageModelUsage;
    parentToolUseId: string | null;
  };
  parts: UIMessagePart[];
}
```

**Transformation:**
```typescript
function transformSDKAssistantMessage(msg: SDKAssistantMessage): UIMessage {
  const parts: UIMessagePart[] = [];

  for (const block of msg.message.content) {
    switch (block.type) {
      case 'text':
        parts.push({
          type: 'text',
          text: block.text,
          state: 'done'
        });
        break;

      case 'thinking':
        parts.push({
          type: 'reasoning',
          text: block.thinking,
          state: 'done'
        });
        break;

      case 'tool_use':
        parts.push(transformToolUseBlock(block));
        break;
    }
  }

  return {
    id: msg.uuid,
    role: 'assistant',
    metadata: {
      sessionId: msg.session_id,
      model: msg.message.model,
      stopReason: msg.message.stop_reason,
      usage: transformUsage(msg.message.usage),
      parentToolUseId: msg.parent_tool_use_id
    },
    parts
  };
}
```

---

### SDKUserMessage → UIMessage

**Source:**
```typescript
type SDKUserMessage = {
  type: 'user';
  uuid?: UUID;
  session_id: string;
  message: {
    role: 'user';
    content: string | Array<TextBlock | ImageBlock | ToolResultBlock>;
  };
  parent_tool_use_id: string | null;
}
```

**Target:**
```typescript
interface UIMessage {
  id: string;
  role: 'user';
  parts: UIMessagePart[];
}
```

**Transformation:**
```typescript
function transformSDKUserMessage(msg: SDKUserMessage): UIMessage {
  const parts: UIMessagePart[] = [];
  const content = msg.message.content;

  if (typeof content === 'string') {
    parts.push({
      type: 'text',
      text: content,
      state: 'done'
    });
  } else {
    for (const block of content) {
      switch (block.type) {
        case 'text':
          parts.push({
            type: 'text',
            text: block.text,
            state: 'done'
          });
          break;

        case 'image':
          parts.push({
            type: 'file',
            mediaType: block.source.media_type,
            url: block.source.type === 'base64'
              ? `data:${block.source.media_type};base64,${block.source.data}`
              : block.source.url
          });
          break;

        case 'tool_result':
          // Tool results in user messages update corresponding assistant tool parts
          // This is handled at the conversation level
          break;
      }
    }
  }

  return {
    id: msg.uuid ?? generateId(),
    role: 'user',
    parts
  };
}
```

---

### SDKSystemMessage → Metadata/Data Part

**Source:**
```typescript
type SDKSystemMessage = {
  type: 'system';
  subtype: 'init';
  uuid: UUID;
  session_id: string;
  apiKeySource: ApiKeySource;
  cwd: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
}
```

**Target (Custom Data Part):**
```typescript
// Option 1: Store as custom data part
type SystemInfoDataPart = {
  type: 'data-system-init';
  data: {
    sessionId: string;
    cwd: string;
    tools: string[];
    mcpServers: { name: string; status: string }[];
    model: string;
    permissionMode: string;
    slashCommands: string[];
  };
};

// Option 2: Emit as metadata on first message
// Option 3: Store in separate state, not in messages
```

**Transformation:**
```typescript
function transformSDKSystemMessage(msg: SDKSystemMessage): UIMessageChunk {
  return {
    type: 'data-system-init',
    data: {
      sessionId: msg.session_id,
      cwd: msg.cwd,
      tools: msg.tools,
      mcpServers: msg.mcp_servers,
      model: msg.model,
      permissionMode: msg.permissionMode,
      slashCommands: msg.slash_commands
    }
  };
}
```

---

### SDKResultMessage → Message Metadata/Finish Event

**Source:**
```typescript
type SDKResultMessage =
  | {
      type: 'result';
      subtype: 'success';
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      result: string;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      structured_output?: unknown;
    }
  | {
      type: 'result';
      subtype: 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      errors: string[];
    };
```

**Target (Finish Event + Data Part):**
```typescript
// Emit as finish chunk
function transformSDKResultMessage(msg: SDKResultMessage): UIMessageChunk[] {
  const chunks: UIMessageChunk[] = [];

  // Emit result data
  chunks.push({
    type: 'data-result',
    data: {
      subtype: msg.subtype,
      durationMs: msg.duration_ms,
      durationApiMs: msg.duration_api_ms,
      numTurns: msg.num_turns,
      totalCostUsd: msg.total_cost_usd,
      usage: transformUsage(msg.usage),
      modelUsage: msg.modelUsage,
      permissionDenials: msg.permission_denials,
      result: msg.subtype === 'success' ? msg.result : undefined,
      structuredOutput: msg.subtype === 'success' ? msg.structured_output : undefined,
      errors: msg.subtype !== 'success' ? msg.errors : undefined
    }
  });

  // Emit finish
  chunks.push({
    type: 'finish',
    finishReason: msg.is_error ? 'error' : 'stop',
    messageMetadata: {
      resultId: msg.uuid,
      sessionId: msg.session_id
    }
  });

  return chunks;
}
```

---

### SDKCompactBoundaryMessage → Data Part

**Source:**
```typescript
type SDKCompactBoundaryMessage = {
  type: 'system';
  subtype: 'compact_boundary';
  uuid: UUID;
  session_id: string;
  compact_metadata: {
    trigger: 'manual' | 'auto';
    pre_tokens: number;
  };
}
```

**Target:**
```typescript
function transformSDKCompactBoundaryMessage(msg: SDKCompactBoundaryMessage): UIMessageChunk {
  return {
    type: 'data-compact-boundary',
    data: {
      trigger: msg.compact_metadata.trigger,
      preTokens: msg.compact_metadata.pre_tokens
    }
  };
}
```

---

## Tool Call Transformations

### Claude Code Built-in Tools

Claude Code has a known set of tools that should be mapped to **static** tool parts:

```typescript
const CLAUDE_CODE_TOOLS = new Set([
  'Task',
  'AskUserQuestion',
  'Bash',
  'BashOutput',
  'Edit',
  'Read',
  'Write',
  'Glob',
  'Grep',
  'KillBash',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'ExitPlanMode',
  'ListMcpResources',
  'ReadMcpResource',
  // MCP tools are dynamic (prefixed with mcp__)
]);
```

### tool_use Block → ToolUIPart

**Source (Anthropic API ToolUseBlock):**
```typescript
type ToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
```

**Target:**
```typescript
// For known Claude Code tools - use static tool parts
type StaticToolUIPart = {
  type: `tool-${ToolName}`;  // e.g., 'tool-Read', 'tool-Bash'
  toolCallId: string;
  state: ToolInvocationState;
  input: ToolInput;
  output?: ToolOutput;
  errorText?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
};

// For MCP tools or unknown tools - use dynamic tool parts
type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolName: string;
  toolCallId: string;
  state: ToolInvocationState;
  input: unknown;
  output?: unknown;
  errorText?: string;
};
```

**Transformation:**
```typescript
function transformToolUseBlock(block: ToolUseBlock): ToolUIPart | DynamicToolUIPart {
  const isKnownTool = CLAUDE_CODE_TOOLS.has(block.name);

  if (isKnownTool) {
    return {
      type: `tool-${block.name}` as const,
      toolCallId: block.id,
      state: 'input-available',
      input: block.input
    };
  } else {
    // MCP tools or unknown tools
    return {
      type: 'dynamic-tool',
      toolName: block.name,
      toolCallId: block.id,
      state: 'input-available',
      input: block.input
    };
  }
}
```

### tool_result Block → Update Tool Part State

**Source (Anthropic API ToolResultBlock):**
```typescript
type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<TextBlock | ImageBlock>;
  is_error?: boolean;
}
```

**Transformation (Update existing tool part):**
```typescript
function applyToolResult(
  parts: UIMessagePart[],
  result: ToolResultBlock
): void {
  // Find the tool part with matching toolCallId
  const toolPart = parts.find(p =>
    ('toolCallId' in p) && p.toolCallId === result.tool_use_id
  );

  if (!toolPart || !('state' in toolPart)) return;

  if (result.is_error) {
    toolPart.state = 'output-error';
    toolPart.errorText = typeof result.content === 'string'
      ? result.content
      : result.content.map(b => b.type === 'text' ? b.text : '').join('\n');
  } else {
    toolPart.state = 'output-available';
    toolPart.output = parseToolOutput(result.content);
  }
}

function parseToolOutput(content: string | Array<TextBlock | ImageBlock>): unknown {
  if (typeof content === 'string') {
    // Try to parse as JSON, fall back to string
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  // Array of blocks
  return content.map(block => {
    if (block.type === 'text') return block.text;
    if (block.type === 'image') return { type: 'image', ...block.source };
    return block;
  });
}
```

### Tool State Transitions

```text
Claude SDK Events                    AI SDK Tool States
─────────────────                    ─────────────────
tool_use (in assistant)     →        input-available
[waiting for permission]    →        approval-requested
[permission granted]        →        approval-responded (approved: true)
[permission denied]         →        output-denied
tool_result (in user)       →        output-available / output-error

Streaming:
content_block_start         →        input-streaming
content_block_delta         →        (update input progressively)
content_block_stop          →        input-available
```

---

## Streaming Transformations

### SDKPartialAssistantMessage → UIMessageChunk

**Source:**
```typescript
type SDKPartialAssistantMessage = {
  type: 'stream_event';
  event: RawMessageStreamEvent;  // From Anthropic SDK
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
}

// RawMessageStreamEvent types:
type RawMessageStreamEvent =
  | { type: 'message_start'; message: Message }
  | { type: 'message_delta'; delta: { stop_reason?: string }; usage: Usage }
  | { type: 'message_stop' }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentBlockDelta }
  | { type: 'content_block_stop'; index: number };

type ContentBlockDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'input_json_delta'; partial_json: string };
```

**Target:**
```typescript
type UIMessageChunk =
  | { type: 'start'; messageId?: string; messageMetadata?: METADATA }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; delta: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string; dynamic?: boolean }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown; dynamic?: boolean }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown; dynamic?: boolean }
  | { type: 'tool-output-error'; toolCallId: string; errorText: string }
  | { type: 'finish'; finishReason?: FinishReason }
  | ...;
```

### Stream Event Transformer

```typescript
interface StreamState {
  messageId: string;
  contentBlocks: Map<number, {
    type: 'text' | 'thinking' | 'tool_use';
    id: string;
    toolName?: string;
    partialInput?: string;
  }>;
}

function* transformStreamEvents(
  events: AsyncIterable<SDKPartialAssistantMessage>
): AsyncGenerator<UIMessageChunk> {
  const state: StreamState = {
    messageId: '',
    contentBlocks: new Map()
  };

  for await (const msg of events) {
    const event = msg.event;

    switch (event.type) {
      case 'message_start':
        state.messageId = msg.uuid;
        yield {
          type: 'start',
          messageId: msg.uuid,
          messageMetadata: {
            sessionId: msg.session_id,
            model: event.message.model
          }
        };
        break;

      case 'content_block_start':
        yield* handleContentBlockStart(event, state);
        break;

      case 'content_block_delta':
        yield* handleContentBlockDelta(event, state);
        break;

      case 'content_block_stop':
        yield* handleContentBlockStop(event, state);
        break;

      case 'message_delta':
        // Message is finishing
        break;

      case 'message_stop':
        yield {
          type: 'finish',
          finishReason: 'stop'
        };
        break;
    }
  }
}

function* handleContentBlockStart(
  event: { type: 'content_block_start'; index: number; content_block: ContentBlock },
  state: StreamState
): Generator<UIMessageChunk> {
  const block = event.content_block;
  const id = `${state.messageId}_${event.index}`;

  switch (block.type) {
    case 'text':
      state.contentBlocks.set(event.index, { type: 'text', id });
      yield { type: 'text-start', id };
      if (block.text) {
        yield { type: 'text-delta', id, delta: block.text };
      }
      break;

    case 'thinking':
      state.contentBlocks.set(event.index, { type: 'thinking', id });
      yield { type: 'reasoning-start', id };
      if (block.thinking) {
        yield { type: 'reasoning-delta', id, delta: block.thinking };
      }
      break;

    case 'tool_use':
      const isDynamic = !CLAUDE_CODE_TOOLS.has(block.name);
      state.contentBlocks.set(event.index, {
        type: 'tool_use',
        id: block.id,
        toolName: block.name,
        partialInput: ''
      });
      yield {
        type: 'tool-input-start',
        toolCallId: block.id,
        toolName: block.name,
        dynamic: isDynamic
      };
      break;
  }
}

function* handleContentBlockDelta(
  event: { type: 'content_block_delta'; index: number; delta: ContentBlockDelta },
  state: StreamState
): Generator<UIMessageChunk> {
  const blockState = state.contentBlocks.get(event.index);
  if (!blockState) return;

  switch (event.delta.type) {
    case 'text_delta':
      yield {
        type: 'text-delta',
        id: blockState.id,
        delta: event.delta.text
      };
      break;

    case 'thinking_delta':
      yield {
        type: 'reasoning-delta',
        id: blockState.id,
        delta: event.delta.thinking
      };
      break;

    case 'input_json_delta':
      blockState.partialInput = (blockState.partialInput || '') + event.delta.partial_json;
      yield {
        type: 'tool-input-delta',
        toolCallId: blockState.id,
        inputTextDelta: event.delta.partial_json
      };
      break;
  }
}

function* handleContentBlockStop(
  event: { type: 'content_block_stop'; index: number },
  state: StreamState
): Generator<UIMessageChunk> {
  const blockState = state.contentBlocks.get(event.index);
  if (!blockState) return;

  switch (blockState.type) {
    case 'text':
      yield { type: 'text-end', id: blockState.id };
      break;

    case 'thinking':
      yield { type: 'reasoning-end', id: blockState.id };
      break;

    case 'tool_use':
      let parsedInput: unknown = {};
      try {
        parsedInput = JSON.parse(blockState.partialInput || '{}');
      } catch {}

      const isDynamic = !CLAUDE_CODE_TOOLS.has(blockState.toolName!);
      yield {
        type: 'tool-input-available',
        toolCallId: blockState.id,
        toolName: blockState.toolName!,
        input: parsedInput,
        dynamic: isDynamic
      };
      break;
  }

  state.contentBlocks.delete(event.index);
}
```

---

## Content Block Transformations

### Text Block

```typescript
// Anthropic SDK
type TextBlock = {
  type: 'text';
  text: string;
}

// AI SDK
type TextUIPart = {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
}
```

### Thinking Block → Reasoning Part

```typescript
// Anthropic SDK
type ThinkingBlock = {
  type: 'thinking';
  thinking: string;
}

// AI SDK
type ReasoningUIPart = {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
}

function transformThinkingBlock(block: ThinkingBlock): ReasoningUIPart {
  return {
    type: 'reasoning',
    text: block.thinking,
    state: 'done'
  };
}
```

### Image Block → File Part

```typescript
// Anthropic SDK
type ImageBlock = {
  type: 'image';
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string };
}

// AI SDK
type FileUIPart = {
  type: 'file';
  mediaType: string;
  filename?: string;
  url: string;
}

function transformImageBlock(block: ImageBlock): FileUIPart {
  return {
    type: 'file',
    mediaType: block.source.type === 'base64'
      ? block.source.media_type
      : 'image/*',
    url: block.source.type === 'base64'
      ? `data:${block.source.media_type};base64,${block.source.data}`
      : block.source.url
  };
}
```

---

## Complete Adapter Implementation

### Type Definitions

```typescript
// Data types for custom parts
interface ClaudeCodeDataTypes {
  'system-init': {
    sessionId: string;
    cwd: string;
    tools: string[];
    mcpServers: { name: string; status: string }[];
    model: string;
    permissionMode: string;
    slashCommands: string[];
  };
  'result': {
    subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
    durationMs: number;
    numTurns: number;
    totalCostUsd: number;
    usage: LanguageModelUsage;
    result?: string;
    structuredOutput?: unknown;
    errors?: string[];
    permissionDenials: SDKPermissionDenial[];
  };
  'compact-boundary': {
    trigger: 'manual' | 'auto';
    preTokens: number;
  };
  'permission-request': {
    toolName: string;
    toolInput: unknown;
    toolUseId: string;
  };
}

// Tool definitions for Claude Code
interface ClaudeCodeTools {
  Task: { input: AgentInput; output: TaskOutput };
  AskUserQuestion: { input: AskUserQuestionInput; output: AskUserQuestionOutput };
  Bash: { input: BashInput; output: BashOutput };
  BashOutput: { input: BashOutputInput; output: BashOutputToolOutput };
  Edit: { input: FileEditInput; output: EditOutput };
  Read: { input: FileReadInput; output: ReadOutput };
  Write: { input: FileWriteInput; output: WriteOutput };
  Glob: { input: GlobInput; output: GlobOutput };
  Grep: { input: GrepInput; output: GrepOutput };
  KillBash: { input: KillShellInput; output: KillBashOutput };
  NotebookEdit: { input: NotebookEditInput; output: NotebookEditOutput };
  WebFetch: { input: WebFetchInput; output: WebFetchOutput };
  WebSearch: { input: WebSearchInput; output: WebSearchOutput };
  TodoWrite: { input: TodoWriteInput; output: TodoWriteOutput };
  ExitPlanMode: { input: ExitPlanModeInput; output: ExitPlanModeOutput };
  ListMcpResources: { input: ListMcpResourcesInput; output: ListMcpResourcesOutput };
  ReadMcpResource: { input: ReadMcpResourceInput; output: ReadMcpResourceOutput };
}

// UI Message type for Claude Code
type ClaudeCodeUIMessage = UIMessage<
  {
    sessionId?: string;
    model?: string;
    stopReason?: string;
    usage?: LanguageModelUsage;
    parentToolUseId?: string | null;
    resultId?: string;
  },
  ClaudeCodeDataTypes,
  ClaudeCodeTools
>;
```

### Main Adapter Class

```typescript
export class ClaudeCodeAdapter {
  private pendingToolCalls: Map<string, {
    toolName: string;
    input: unknown;
    messageId: string;
    partIndex: number;
  }> = new Map();

  private messages: ClaudeCodeUIMessage[] = [];
  private streamState: StreamState | null = null;

  /**
   * Process a single SDKMessage and return UI updates
   */
  processMessage(msg: SDKMessage): {
    messages: ClaudeCodeUIMessage[];
    chunks: UIMessageChunk[];
  } {
    const chunks: UIMessageChunk[] = [];

    switch (msg.type) {
      case 'assistant':
        this.processAssistantMessage(msg);
        break;

      case 'user':
        this.processUserMessage(msg);
        break;

      case 'system':
        if (msg.subtype === 'init') {
          chunks.push(this.transformSystemInit(msg));
        } else if (msg.subtype === 'compact_boundary') {
          chunks.push(this.transformCompactBoundary(msg as SDKCompactBoundaryMessage));
        }
        break;

      case 'result':
        chunks.push(...this.transformResult(msg));
        break;

      case 'stream_event':
        chunks.push(...this.processStreamEvent(msg));
        break;
    }

    return { messages: this.messages, chunks };
  }

  /**
   * Process a complete async stream of SDK messages
   */
  async *processStream(
    sdkMessages: AsyncIterable<SDKMessage>
  ): AsyncGenerator<UIMessageChunk> {
    for await (const msg of sdkMessages) {
      const { chunks } = this.processMessage(msg);
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  }

  private processAssistantMessage(msg: SDKAssistantMessage): void {
    const uiMessage: ClaudeCodeUIMessage = {
      id: msg.uuid,
      role: 'assistant',
      metadata: {
        sessionId: msg.session_id,
        model: msg.message.model,
        stopReason: msg.message.stop_reason,
        usage: this.transformUsage(msg.message.usage),
        parentToolUseId: msg.parent_tool_use_id
      },
      parts: []
    };

    for (const block of msg.message.content) {
      const partIndex = uiMessage.parts.length;

      switch (block.type) {
        case 'text':
          uiMessage.parts.push({
            type: 'text',
            text: block.text,
            state: 'done'
          });
          break;

        case 'thinking':
          uiMessage.parts.push({
            type: 'reasoning',
            text: block.thinking,
            state: 'done'
          });
          break;

        case 'tool_use':
          const isDynamic = !CLAUDE_CODE_TOOLS.has(block.name);

          if (isDynamic) {
            uiMessage.parts.push({
              type: 'dynamic-tool',
              toolName: block.name,
              toolCallId: block.id,
              state: 'input-available',
              input: block.input
            });
          } else {
            uiMessage.parts.push({
              type: `tool-${block.name}` as any,
              toolCallId: block.id,
              state: 'input-available',
              input: block.input
            });
          }

          // Track pending tool call
          this.pendingToolCalls.set(block.id, {
            toolName: block.name,
            input: block.input,
            messageId: msg.uuid,
            partIndex
          });
          break;
      }
    }

    this.messages.push(uiMessage);
  }

  private processUserMessage(msg: SDKUserMessage | SDKUserMessageReplay): void {
    const content = msg.message.content;

    // Check for tool results in user message
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_result') {
          this.applyToolResult(block);
        }
      }
    }

    // Create user message
    const uiMessage: ClaudeCodeUIMessage = {
      id: msg.uuid ?? generateId(),
      role: 'user',
      parts: []
    };

    if (typeof content === 'string') {
      uiMessage.parts.push({
        type: 'text',
        text: content,
        state: 'done'
      });
    } else {
      for (const block of content) {
        switch (block.type) {
          case 'text':
            uiMessage.parts.push({
              type: 'text',
              text: block.text,
              state: 'done'
            });
            break;

          case 'image':
            uiMessage.parts.push(this.transformImageBlock(block));
            break;

          // tool_result already handled above
        }
      }
    }

    // Only add if has content parts
    if (uiMessage.parts.length > 0) {
      this.messages.push(uiMessage);
    }
  }

  private applyToolResult(result: ToolResultBlock): void {
    const pending = this.pendingToolCalls.get(result.tool_use_id);
    if (!pending) return;

    const message = this.messages.find(m => m.id === pending.messageId);
    if (!message) return;

    const part = message.parts[pending.partIndex];
    if (!part || !('state' in part)) return;

    if (result.is_error) {
      part.state = 'output-error';
      (part as any).errorText = this.extractTextContent(result.content);
    } else {
      part.state = 'output-available';
      (part as any).output = this.parseToolOutput(result.content);
    }

    this.pendingToolCalls.delete(result.tool_use_id);
  }

  private processStreamEvent(msg: SDKPartialAssistantMessage): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];
    const event = msg.event;

    if (!this.streamState) {
      this.streamState = {
        messageId: msg.uuid,
        contentBlocks: new Map()
      };
    }

    switch (event.type) {
      case 'message_start':
        chunks.push({
          type: 'start',
          messageId: msg.uuid,
          messageMetadata: {
            sessionId: msg.session_id,
            model: event.message.model
          }
        });
        break;

      case 'content_block_start':
        chunks.push(...this.handleContentBlockStart(event));
        break;

      case 'content_block_delta':
        chunks.push(...this.handleContentBlockDelta(event));
        break;

      case 'content_block_stop':
        chunks.push(...this.handleContentBlockStop(event));
        break;

      case 'message_stop':
        chunks.push({
          type: 'finish',
          finishReason: 'stop'
        });
        this.streamState = null;
        break;
    }

    return chunks;
  }

  private handleContentBlockStart(
    event: ContentBlockStartEvent
  ): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];
    const block = event.content_block;
    const id = `${this.streamState!.messageId}_${event.index}`;

    switch (block.type) {
      case 'text':
        this.streamState!.contentBlocks.set(event.index, { type: 'text', id });
        chunks.push({ type: 'text-start', id });
        if (block.text) {
          chunks.push({ type: 'text-delta', id, delta: block.text });
        }
        break;

      case 'thinking':
        this.streamState!.contentBlocks.set(event.index, { type: 'thinking', id });
        chunks.push({ type: 'reasoning-start', id });
        if (block.thinking) {
          chunks.push({ type: 'reasoning-delta', id, delta: block.thinking });
        }
        break;

      case 'tool_use':
        const isDynamic = !CLAUDE_CODE_TOOLS.has(block.name);
        this.streamState!.contentBlocks.set(event.index, {
          type: 'tool_use',
          id: block.id,
          toolName: block.name,
          partialInput: ''
        });
        chunks.push({
          type: 'tool-input-start',
          toolCallId: block.id,
          toolName: block.name,
          dynamic: isDynamic
        });
        break;
    }

    return chunks;
  }

  private handleContentBlockDelta(
    event: ContentBlockDeltaEvent
  ): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];
    const blockState = this.streamState!.contentBlocks.get(event.index);
    if (!blockState) return chunks;

    switch (event.delta.type) {
      case 'text_delta':
        chunks.push({
          type: 'text-delta',
          id: blockState.id,
          delta: event.delta.text
        });
        break;

      case 'thinking_delta':
        chunks.push({
          type: 'reasoning-delta',
          id: blockState.id,
          delta: event.delta.thinking
        });
        break;

      case 'input_json_delta':
        blockState.partialInput = (blockState.partialInput || '') + event.delta.partial_json;
        chunks.push({
          type: 'tool-input-delta',
          toolCallId: blockState.id,
          inputTextDelta: event.delta.partial_json
        });
        break;
    }

    return chunks;
  }

  private handleContentBlockStop(
    event: ContentBlockStopEvent
  ): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];
    const blockState = this.streamState!.contentBlocks.get(event.index);
    if (!blockState) return chunks;

    switch (blockState.type) {
      case 'text':
        chunks.push({ type: 'text-end', id: blockState.id });
        break;

      case 'thinking':
        chunks.push({ type: 'reasoning-end', id: blockState.id });
        break;

      case 'tool_use':
        let parsedInput: unknown = {};
        try {
          parsedInput = JSON.parse(blockState.partialInput || '{}');
        } catch {}

        const isDynamic = !CLAUDE_CODE_TOOLS.has(blockState.toolName!);
        chunks.push({
          type: 'tool-input-available',
          toolCallId: blockState.id,
          toolName: blockState.toolName!,
          input: parsedInput,
          dynamic: isDynamic
        });
        break;
    }

    this.streamState!.contentBlocks.delete(event.index);
    return chunks;
  }

  private transformSystemInit(msg: SDKSystemMessage): UIMessageChunk {
    return {
      type: 'data-system-init',
      data: {
        sessionId: msg.session_id,
        cwd: msg.cwd,
        tools: msg.tools,
        mcpServers: msg.mcp_servers,
        model: msg.model,
        permissionMode: msg.permissionMode,
        slashCommands: msg.slash_commands
      }
    };
  }

  private transformCompactBoundary(msg: SDKCompactBoundaryMessage): UIMessageChunk {
    return {
      type: 'data-compact-boundary',
      data: {
        trigger: msg.compact_metadata.trigger,
        preTokens: msg.compact_metadata.pre_tokens
      }
    };
  }

  private transformResult(msg: SDKResultMessage): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];

    chunks.push({
      type: 'data-result',
      data: {
        subtype: msg.subtype,
        durationMs: msg.duration_ms,
        numTurns: msg.num_turns,
        totalCostUsd: msg.total_cost_usd,
        usage: this.transformUsage(msg.usage),
        result: msg.subtype === 'success' ? (msg as any).result : undefined,
        structuredOutput: msg.subtype === 'success' ? (msg as any).structured_output : undefined,
        errors: msg.subtype !== 'success' ? (msg as any).errors : undefined,
        permissionDenials: msg.permission_denials
      }
    });

    chunks.push({
      type: 'finish',
      finishReason: msg.is_error ? 'error' : 'stop',
      messageMetadata: {
        resultId: msg.uuid,
        sessionId: msg.session_id
      }
    });

    return chunks;
  }

  private transformUsage(usage: any): LanguageModelUsage {
    return {
      inputTokens: usage.input_tokens ?? undefined,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? undefined
      },
      outputTokens: usage.output_tokens ?? undefined,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined
      },
      totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
    };
  }

  private transformImageBlock(block: ImageBlock): FileUIPart {
    return {
      type: 'file',
      mediaType: block.source.type === 'base64'
        ? block.source.media_type
        : 'image/*',
      url: block.source.type === 'base64'
        ? `data:${block.source.media_type};base64,${block.source.data}`
        : block.source.url
    };
  }

  private extractTextContent(content: string | ContentBlock[]): string {
    if (typeof content === 'string') return content;
    return content
      .filter(b => b.type === 'text')
      .map(b => (b as TextBlock).text)
      .join('\n');
  }

  private parseToolOutput(content: string | ContentBlock[]): unknown {
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }
    return content.map(block => {
      if (block.type === 'text') return (block as TextBlock).text;
      return block;
    });
  }
}
```

---

## Edge Cases and Special Handling

### 1. Permission Requests

When Claude Code needs permission to execute a tool:

```typescript
// Emit approval request chunk
function emitPermissionRequest(
  toolName: string,
  toolInput: unknown,
  toolUseId: string
): UIMessageChunk {
  return {
    type: 'tool-approval-request',
    approvalId: `approval_${toolUseId}`,
    toolCallId: toolUseId
  };
}

// Handle approval response
function handleApprovalResponse(
  toolCallId: string,
  approved: boolean,
  reason?: string
): UIMessageChunk {
  if (approved) {
    // Tool will proceed, wait for output
    return {
      type: 'tool-approval-response',
      approvalId: `approval_${toolCallId}`,
      approved: true,
      reason
    };
  } else {
    return {
      type: 'tool-output-denied',
      toolCallId
    };
  }
}
```

### 2. Nested Tool Calls (Subagents)

When a tool call spawns subagent activity:

```typescript
// Track parent tool relationship
interface ToolCallWithParent {
  toolCallId: string;
  parentToolUseId: string | null;
}

// In streaming, track the hierarchy
if (msg.parent_tool_use_id) {
  // This is a nested message from a subagent
  // Associate with parent tool call
}
```

### 3. Conversation Resumption

When resuming a session:

```typescript
// SDKUserMessageReplay has required UUID
type SDKUserMessageReplay = SDKUserMessage & { uuid: UUID };

// Replayed messages should maintain their original IDs
function handleReplayedMessage(msg: SDKUserMessageReplay): ClaudeCodeUIMessage {
  return {
    id: msg.uuid,  // Keep original ID
    role: 'user',
    parts: [...]
  };
}
```

### 4. Error States

```typescript
// Tool execution error
function handleToolError(
  toolCallId: string,
  error: string
): UIMessageChunk {
  return {
    type: 'tool-output-error',
    toolCallId,
    errorText: error
  };
}

// Session error
function handleSessionError(
  msg: SDKResultMessage & { subtype: 'error_during_execution' }
): UIMessageChunk[] {
  return [
    {
      type: 'error',
      errorText: msg.errors.join('\n')
    },
    {
      type: 'finish',
      finishReason: 'error'
    }
  ];
}
```

### 5. MCP Tool Handling

MCP tools are always dynamic (prefixed with `mcp__`):

```typescript
function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__');
}

// MCP tools always use dynamic-tool type
function transformMcpToolCall(block: ToolUseBlock): DynamicToolUIPart {
  return {
    type: 'dynamic-tool',
    toolName: block.name,
    toolCallId: block.id,
    state: 'input-available',
    input: block.input,
    title: extractMcpToolTitle(block.name)  // e.g., "mcp__server__tool" -> "Tool"
  };
}

function extractMcpToolTitle(toolName: string): string {
  const parts = toolName.split('__');
  if (parts.length >= 3) {
    return parts[2];  // Get the tool name part
  }
  return toolName;
}
```

### 6. AskUserQuestion Special Handling

This tool requires special UI rendering:

```typescript
interface AskUserQuestionToolPart {
  type: 'tool-AskUserQuestion';
  toolCallId: string;
  state: 'input-available' | 'output-available';
  input: {
    questions: Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiSelect: boolean;
    }>;
  };
  output?: {
    questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }>;
    answers: Record<string, string>;
  };
}

// Frontend should render a question form when state is 'input-available'
// and the user's response should be sent back to the agent
```

### 7. TodoWrite Special Handling

Track task list state:

```typescript
interface TodoWriteToolPart {
  type: 'tool-TodoWrite';
  toolCallId: string;
  state: 'input-available' | 'output-available';
  input: {
    todos: Array<{
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
      activeForm: string;
    }>;
  };
  output?: {
    message: string;
    stats: {
      total: number;
      pending: number;
      in_progress: number;
      completed: number;
    };
  };
}

// Frontend can render a live task list from the latest TodoWrite
```

### 8. WebSearch Sources Handling

When WebSearch tool is used, emit source parts for citation:

```typescript
interface WebSearchOutput {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  total_results: number;
  query: string;
}

// Transform WebSearch results to source-url parts
function emitWebSearchSources(output: WebSearchOutput): UIMessageChunk[] {
  return output.results.map((result, index) => ({
    type: 'source-url' as const,
    sourceId: `search_${index}`,
    url: result.url,
    title: result.title
  }));
}
```

### 9. Abort/Interrupt Handling

When the user interrupts a stream:

```typescript
// Emit abort chunk
function handleAbort(reason?: string): UIMessageChunk {
  return {
    type: 'abort',
    reason: reason ?? 'User interrupted'
  };
}

// In the adapter, handle Query.interrupt()
async function interruptStream(query: Query): Promise<UIMessageChunk> {
  await query.interrupt();
  return { type: 'abort', reason: 'User interrupted' };
}
```

### 10. Step Tracking (Multi-turn)

For tracking agent turns/steps:

```typescript
// Emit at the start of each agent turn
function emitStepStart(): UIMessageChunk {
  return { type: 'start-step' };
}

// Emit at the end of each agent turn
function emitStepFinish(): UIMessageChunk {
  return { type: 'finish-step' };
}

// In streaming, track turn boundaries
// message_start -> start-step
// message_stop (before next message_start or result) -> finish-step
```

---

## Bidirectional Communication

The Claude Agents SDK supports streaming input mode for bidirectional communication. This is essential for:
- Permission approvals/denials
- User answers to AskUserQuestion
- Stream interrupts

### Streaming Input Mode

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// Create an async generator for user input
async function* userInputStream(): AsyncIterable<SDKUserMessage> {
  // Initial prompt
  yield {
    type: 'user',
    session_id: sessionId,
    message: { role: 'user', content: 'Initial prompt' },
    parent_tool_use_id: null
  };

  // Wait for and yield subsequent user inputs
  while (true) {
    const userInput = await waitForUserInput(); // Your implementation
    if (!userInput) break;

    yield {
      type: 'user',
      session_id: sessionId,
      message: { role: 'user', content: userInput },
      parent_tool_use_id: null
    };
  }
}

// Use streaming input mode
const stream = query({
  prompt: userInputStream(),
  options: { /* ... */ }
});

// Process output while allowing input
for await (const msg of stream) {
  // Handle messages...
}
```

### Permission Flow Integration

```typescript
interface PermissionBridge {
  // Called when permission is needed
  onPermissionRequest: (request: {
    toolName: string;
    toolInput: unknown;
    toolUseId: string;
    suggestions?: PermissionUpdate[];
  }) => void;

  // Called by frontend to respond
  respondToPermission: (
    toolUseId: string,
    approved: boolean,
    reason?: string,
    updates?: PermissionUpdate[]
  ) => void;
}

// Using canUseTool callback for permission handling
const stream = query({
  prompt: 'Do something',
  options: {
    canUseTool: async (toolName, input, { signal, suggestions }) => {
      // Emit permission request to frontend
      emitChunk({
        type: 'tool-approval-request',
        approvalId: `approval_${input.toolUseId}`,
        toolCallId: input.toolUseId
      });

      // Wait for frontend response
      const response = await waitForPermissionResponse(input.toolUseId, signal);

      if (response.approved) {
        return {
          behavior: 'allow',
          updatedInput: input,
          updatedPermissions: response.updates
        };
      } else {
        return {
          behavior: 'deny',
          message: response.reason ?? 'User denied permission'
        };
      }
    }
  }
});
```

### AskUserQuestion Response Flow

```typescript
// When AskUserQuestion tool is invoked, frontend receives:
// { type: 'tool-AskUserQuestion', state: 'input-available', input: { questions: [...] } }

// Frontend collects answers and sends them back
// The agent receives them via the streaming input or a separate mechanism

// Option 1: Using hooks
const stream = query({
  prompt: userInputStream,
  options: {
    hooks: {
      PreToolUse: [{
        matcher: 'AskUserQuestion',
        hooks: [async (input, toolUseId) => {
          // Emit to frontend
          emitChunk({
            type: 'tool-input-available',
            toolCallId: toolUseId,
            toolName: 'AskUserQuestion',
            input: input.tool_input
          });

          // Wait for answers
          const answers = await waitForUserAnswers(toolUseId);

          // Return updated input with answers
          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              updatedInput: {
                ...input.tool_input,
                answers
              }
            }
          };
        }]
      }]
    }
  }
});
```

---

## Complete UIMessageChunk Reference

All chunk types the adapter should emit:

```typescript
type UIMessageChunk =
  // Message lifecycle
  | { type: 'start'; messageId?: string; messageMetadata?: unknown }
  | { type: 'finish'; finishReason?: FinishReason; messageMetadata?: unknown }
  | { type: 'abort'; reason?: string }
  | { type: 'error'; errorText: string }
  | { type: 'message-metadata'; messageMetadata: unknown }

  // Step tracking
  | { type: 'start-step' }
  | { type: 'finish-step' }

  // Text streaming
  | { type: 'text-start'; id: string; providerMetadata?: unknown }
  | { type: 'text-delta'; id: string; delta: string; providerMetadata?: unknown }
  | { type: 'text-end'; id: string; providerMetadata?: unknown }

  // Reasoning streaming
  | { type: 'reasoning-start'; id: string; providerMetadata?: unknown }
  | { type: 'reasoning-delta'; id: string; delta: string; providerMetadata?: unknown }
  | { type: 'reasoning-end'; id: string; providerMetadata?: unknown }

  // Tool streaming
  | { type: 'tool-input-start'; toolCallId: string; toolName: string; dynamic?: boolean; title?: string; providerExecuted?: boolean }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown; dynamic?: boolean; title?: string; providerMetadata?: unknown }
  | { type: 'tool-input-error'; toolCallId: string; toolName: string; input?: unknown; errorText: string; dynamic?: boolean; title?: string }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown; dynamic?: boolean; preliminary?: boolean }
  | { type: 'tool-output-error'; toolCallId: string; errorText: string; dynamic?: boolean }
  | { type: 'tool-output-denied'; toolCallId: string }
  | { type: 'tool-approval-request'; approvalId: string; toolCallId: string }

  // Sources (for web search)
  | { type: 'source-url'; sourceId: string; url: string; title?: string; providerMetadata?: unknown }
  | { type: 'source-document'; sourceId: string; mediaType: string; title: string; filename?: string; providerMetadata?: unknown }

  // Files
  | { type: 'file'; url: string; mediaType: string; filename?: string; providerMetadata?: unknown }

  // Custom data
  | { type: `data-${string}`; id?: string; data: unknown; transient?: boolean };

type FinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';
```

---

## Summary: Quick Reference Tables

### Message Type Mapping

| Claude Agents SDK | AI SDK | Notes |
| ----------------- | ------ | ----- |
| `SDKAssistantMessage` | `UIMessage { role: 'assistant' }` | Map content blocks to parts |
| `SDKUserMessage` | `UIMessage { role: 'user' }` | Handle tool results |
| `SDKUserMessageReplay` | `UIMessage { role: 'user' }` | Keep original UUID |
| `SDKSystemMessage (init)` | `data-system-init` chunk | Session metadata |
| `SDKSystemMessage (compact)` | `data-compact-boundary` chunk | Compaction marker |
| `SDKResultMessage` | `data-result` + `finish` chunks | Final result |
| `SDKPartialAssistantMessage` | `UIMessageChunk` events | Streaming |

### Content Block to Part Mapping

| Anthropic Content Block | AI SDK Part | Type Field |
| ----------------------- | ----------- | ---------- |
| `text` | `TextUIPart` | `'text'` |
| `thinking` | `ReasoningUIPart` | `'reasoning'` |
| `tool_use` (known) | `ToolUIPart` | `'tool-{name}'` |
| `tool_use` (unknown/MCP) | `DynamicToolUIPart` | `'dynamic-tool'` |
| `image` | `FileUIPart` | `'file'` |

### Stream Event Mapping

| Anthropic Event | AI SDK Chunk | Notes |
| --------------- | ------------ | ----- |
| `message_start` | `start` | Includes message metadata |
| `content_block_start (text)` | `text-start` | Begin text streaming |
| `content_block_delta (text_delta)` | `text-delta` | Text chunk |
| `content_block_stop (text)` | `text-end` | End text streaming |
| `content_block_start (thinking)` | `reasoning-start` | Begin reasoning |
| `content_block_delta (thinking_delta)` | `reasoning-delta` | Reasoning chunk |
| `content_block_stop (thinking)` | `reasoning-end` | End reasoning |
| `content_block_start (tool_use)` | `tool-input-start` | Begin tool input |
| `content_block_delta (input_json_delta)` | `tool-input-delta` | Input chunk |
| `content_block_stop (tool_use)` | `tool-input-available` | Complete input |
| `message_stop` | `finish` | Stream complete |
| Query.interrupt() | `abort` | User interrupt |
| Tool result (success) | `tool-output-available` | Tool completed |
| Tool result (error) | `tool-output-error` | Tool failed |
| Permission denied | `tool-output-denied` | User denied |
| WebSearch results | `source-url` | Per search result |

### Tool State Mapping

| Claude Agents SDK State | AI SDK Tool State |
| ----------------------- | ----------------- |
| `tool_use` in assistant content | `input-available` |
| Waiting for permission | `approval-requested` |
| Permission granted | `approval-responded` |
| Permission denied | `output-denied` |
| `tool_result` (success) | `output-available` |
| `tool_result` (is_error) | `output-error` |
| Streaming input | `input-streaming` |

### Complete Chunk Type Reference

| Category | Chunk Types |
| -------- | ----------- |
| Lifecycle | `start`, `finish`, `abort`, `error`, `message-metadata` |
| Steps | `start-step`, `finish-step` |
| Text | `text-start`, `text-delta`, `text-end` |
| Reasoning | `reasoning-start`, `reasoning-delta`, `reasoning-end` |
| Tools | `tool-input-start`, `tool-input-delta`, `tool-input-available`, `tool-input-error`, `tool-output-available`, `tool-output-error`, `tool-output-denied`, `tool-approval-request` |
| Sources | `source-url`, `source-document` |
| Files | `file` |
| Custom | `data-{name}` |
