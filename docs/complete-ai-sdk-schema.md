# AI SDK V6 Complete Schema Reference

This document provides a comprehensive reference of all types, interfaces, and schemas used in the AI SDK V6. Use this as a guide for translating other agent outputs (like Claude Code) into AI SDK-compatible formats for rendering with `@ai-sdk/react`.

## Table of Contents

1. [Overview](#overview)
2. [Message Types](#message-types)
3. [Message Content Parts](#message-content-parts)
4. [UI Message Types](#ui-message-types)
5. [UI Message Parts](#ui-message-parts)
6. [Tool Types](#tool-types)
7. [Streaming Types](#streaming-types)
8. [React Hook Types](#react-hook-types)
9. [Metadata and Usage Types](#metadata-and-usage-types)
10. [File and Attachment Types](#file-and-attachment-types)
11. [Chat State Types](#chat-state-types)
12. [Translation Guide](#translation-guide)

---

## Overview

The AI SDK V6 has a layered type system:

1. **Model Messages** - Core message types for AI model communication
2. **UI Messages** - High-level UI representation for client-side rendering
3. **UI Message Chunks** - Streaming events for real-time updates
4. **Tool Types** - Comprehensive tool calling system with approval workflows

---

## Message Types

### ModelMessage (Union Type)

The base message type sent to language models:

```typescript
type ModelMessage =
  | SystemModelMessage
  | UserModelMessage
  | AssistantModelMessage
  | ToolModelMessage;
```

### SystemModelMessage

```typescript
type SystemModelMessage = {
  role: 'system';
  content: string;
  providerOptions?: ProviderOptions;
};
```

### UserModelMessage

```typescript
type UserModelMessage = {
  role: 'user';
  content: UserContent;
  providerOptions?: ProviderOptions;
};

type UserContent = string | Array<TextPart | ImagePart | FilePart>;
```

### AssistantModelMessage

```typescript
type AssistantModelMessage = {
  role: 'assistant';
  content: AssistantContent;
  providerOptions?: ProviderOptions;
};

type AssistantContent =
  | string
  | Array<
      | TextPart
      | FilePart
      | ReasoningPart
      | ToolCallPart
      | ToolResultPart
      | ToolApprovalRequest
    >;
```

### ToolModelMessage

```typescript
type ToolModelMessage = {
  role: 'tool';
  content: ToolContent;
  providerOptions?: ProviderOptions;
};

type ToolContent = Array<ToolResultPart | ToolApprovalResponse>;
```

---

## Message Content Parts

### TextPart

```typescript
interface TextPart {
  type: 'text';
  text: string;
  providerOptions?: ProviderOptions;
}
```

### ImagePart

```typescript
interface ImagePart {
  type: 'image';
  image: DataContent | URL;
  mediaType?: string;  // IANA media type (optional)
  providerOptions?: ProviderOptions;
}
```

### FilePart

```typescript
interface FilePart {
  type: 'file';
  data: DataContent | URL;
  filename?: string;
  mediaType: string;  // IANA media type (required)
  providerOptions?: ProviderOptions;
}
```

### ReasoningPart

```typescript
interface ReasoningPart {
  type: 'reasoning';
  text: string;
  providerOptions?: ProviderOptions;
}
```

### ToolCallPart

```typescript
interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerOptions?: ProviderOptions;
  providerExecuted?: boolean;
}
```

### ToolResultPart

```typescript
interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: ToolResultOutput;
  providerOptions?: ProviderOptions;
}

type ToolResultOutput =
  | { type: 'text'; value: string; providerOptions?: ProviderOptions }
  | { type: 'json'; value: JSONValue; providerOptions?: ProviderOptions }
  | { type: 'execution-denied'; reason?: string; providerOptions?: ProviderOptions }
  | { type: 'error-text'; value: string; providerOptions?: ProviderOptions }
  | { type: 'error-json'; value: JSONValue; providerOptions?: ProviderOptions }
  | {
      type: 'content';
      value: Array<
        | { type: 'text'; text: string; providerOptions?: ProviderOptions }
        | { type: 'file-data'; data: string; mediaType: string; filename?: string; providerOptions?: ProviderOptions }
        | { type: 'file-url'; url: string; providerOptions?: ProviderOptions }
        | { type: 'file-id'; fileId: string | Record<string, string>; providerOptions?: ProviderOptions }
        | { type: 'image-data'; data: string; mediaType: string; providerOptions?: ProviderOptions }
        | { type: 'image-url'; url: string; providerOptions?: ProviderOptions }
        | { type: 'image-file-id'; fileId: string | Record<string, string>; providerOptions?: ProviderOptions }
        | { type: 'custom'; providerOptions?: ProviderOptions }
      >;
      providerOptions?: ProviderOptions;
    };
```

### DataContent

```typescript
type DataContent = string | Uint8Array | ArrayBuffer | Buffer;
```

---

## UI Message Types

### UIMessage (Main Interface)

This is the primary type used by `@ai-sdk/react` for rendering:

```typescript
interface UIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> {
  /** A unique identifier for the message */
  id: string;

  /** The role of the message */
  role: 'system' | 'user' | 'assistant';

  /** Optional metadata for the message */
  metadata?: METADATA;

  /** The parts of the message - use this for rendering */
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}
```

### UIDataTypes and UITools

```typescript
type UIDataTypes = Record<string, unknown>;

type UITool = {
  input: unknown;
  output: unknown | undefined;
};

type UITools = Record<string, UITool>;
```

---

## UI Message Parts

### UIMessagePart (Union Type)

```typescript
type UIMessagePart<DATA_TYPES extends UIDataTypes, TOOLS extends UITools> =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart<TOOLS>
  | DynamicToolUIPart
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | FileUIPart
  | DataUIPart<DATA_TYPES>
  | StepStartUIPart;
```

### TextUIPart

```typescript
type TextUIPart = {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: ProviderMetadata;
};
```

### ReasoningUIPart

```typescript
type ReasoningUIPart = {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: ProviderMetadata;
};
```

### FileUIPart

```typescript
type FileUIPart = {
  type: 'file';
  mediaType: string;
  filename?: string;
  url: string;
  providerMetadata?: ProviderMetadata;
};
```

### SourceUrlUIPart

```typescript
type SourceUrlUIPart = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
  providerMetadata?: ProviderMetadata;
};
```

### SourceDocumentUIPart

```typescript
type SourceDocumentUIPart = {
  type: 'source-document';
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
  providerMetadata?: ProviderMetadata;
};
```

### StepStartUIPart

```typescript
type StepStartUIPart = {
  type: 'step-start';
};
```

### DataUIPart

```typescript
type DataUIPart<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`;
    id?: string;
    data: DATA_TYPES[NAME];
  };
}>;
```

### ToolUIPart (Static Tools)

```typescript
type ToolUIPart<TOOLS extends UITools = UITools> = ValueOf<{
  [NAME in keyof TOOLS & string]: {
    type: `tool-${NAME}`;
  } & UIToolInvocation<TOOLS[NAME]>;
}>;
```

### DynamicToolUIPart

For tools not known at compile time:

```typescript
type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolName: string;
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
} & ToolInvocationState;
```

### UIToolInvocation (Tool State Machine)

Tools have multiple states during their lifecycle:

```typescript
type UIToolInvocation<TOOL extends UITool | Tool> = {
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
} & (
  | {
      state: 'input-streaming';
      input: DeepPartial<TOOL['input']> | undefined;
      output?: never;
      errorText?: never;
      approval?: never;
    }
  | {
      state: 'input-available';
      input: TOOL['input'];
      output?: never;
      errorText?: never;
      callProviderMetadata?: ProviderMetadata;
      approval?: never;
    }
  | {
      state: 'approval-requested';
      input: TOOL['input'];
      output?: never;
      errorText?: never;
      callProviderMetadata?: ProviderMetadata;
      approval: { id: string; approved?: never; reason?: never };
    }
  | {
      state: 'approval-responded';
      input: TOOL['input'];
      output?: never;
      errorText?: never;
      callProviderMetadata?: ProviderMetadata;
      approval: { id: string; approved: boolean; reason?: string };
    }
  | {
      state: 'output-available';
      input: TOOL['input'];
      output: TOOL['output'];
      errorText?: never;
      callProviderMetadata?: ProviderMetadata;
      preliminary?: boolean;
      approval?: { id: string; approved: true; reason?: string };
    }
  | {
      state: 'output-error';
      input: TOOL['input'] | undefined;
      rawInput?: unknown;
      output?: never;
      errorText: string;
      callProviderMetadata?: ProviderMetadata;
      approval?: { id: string; approved: true; reason?: string };
    }
  | {
      state: 'output-denied';
      input: TOOL['input'];
      output?: never;
      errorText?: never;
      callProviderMetadata?: ProviderMetadata;
      approval: { id: string; approved: false; reason?: string };
    }
);
```

---

## Tool Types

### Tool Definition

```typescript
type Tool<INPUT = any, OUTPUT = any> = {
  description?: string;
  title?: string;
  providerOptions?: ProviderOptions;
  inputSchema: FlexibleSchema<INPUT>;
  inputExamples?: Array<{ input: INPUT }>;
  needsApproval?: boolean | ToolNeedsApprovalFunction<INPUT>;
  strict?: boolean;
  onInputStart?: (options: ToolExecutionOptions) => void | PromiseLike<void>;
  onInputDelta?: (options: { inputTextDelta: string } & ToolExecutionOptions) => void | PromiseLike<void>;
  onInputAvailable?: (options: { input: INPUT } & ToolExecutionOptions) => void | PromiseLike<void>;
  execute?: ToolExecuteFunction<INPUT, OUTPUT>;
  outputSchema?: FlexibleSchema<OUTPUT>;
  toModelOutput?: (options: {
    toolCallId: string;
    input: INPUT;
    output: OUTPUT;
  }) => ToolResultOutput | PromiseLike<ToolResultOutput>;
} & (
  | { type?: undefined | 'function' }
  | { type: 'dynamic' }
  | { type: 'provider'; id: `${string}.${string}`; args: Record<string, unknown>; supportsDeferredResults?: boolean }
);
```

### ToolCall

```typescript
interface ToolCall<NAME extends string, INPUT> {
  toolCallId: string;
  toolName: NAME;
  input: INPUT;
  providerExecuted?: boolean;
  dynamic?: boolean;
}
```

### TypedToolCall

```typescript
type TypedToolCall<TOOLS extends ToolSet> =
  | StaticToolCall<TOOLS>
  | DynamicToolCall;

type StaticToolCall<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    providerExecuted?: boolean;
    providerMetadata?: ProviderMetadata;
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    dynamic?: false;
    title?: string;
  };
}>;

type DynamicToolCall = {
  type: 'tool-call';
  toolCallId: string;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  toolName: string;
  input: unknown;
  dynamic: true;
  title?: string;
  invalid?: boolean;
  error?: unknown;
};
```

### ToolResult

```typescript
interface ToolResult<NAME extends string, INPUT, OUTPUT> {
  toolCallId: string;
  toolName: NAME;
  input: INPUT;
  output: OUTPUT;
  providerExecuted?: boolean;
  dynamic?: boolean;
}
```

### TypedToolResult

```typescript
type TypedToolResult<TOOLS extends ToolSet> =
  | StaticToolResult<TOOLS>
  | DynamicToolResult;

type StaticToolResult<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-result';
    toolCallId: string;
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    output: InferToolOutput<TOOLS[NAME]>;
    providerExecuted?: boolean;
    providerMetadata?: ProviderMetadata;
    dynamic?: false;
    preliminary?: boolean;
    title?: string;
  };
}>;

type DynamicToolResult = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic: true;
  preliminary?: boolean;
  title?: string;
};
```

### ToolError

```typescript
type TypedToolError<TOOLS extends ToolSet> = {
  type: 'tool-error';
  toolCallId: string;
  toolName: string;
  input: unknown;
  error: unknown;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic?: boolean;
  title?: string;
};
```

### Tool Approval Types

```typescript
type ToolApprovalRequest = {
  type: 'tool-approval-request';
  approvalId: string;
  toolCallId: string;
};

type ToolApprovalResponse = {
  type: 'tool-approval-response';
  approvalId: string;
  approved: boolean;
  reason?: string;
  providerExecuted?: boolean;
};
```

### ToolChoice

```typescript
type ToolChoice<TOOLS extends Record<string, unknown>> =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'tool'; toolName: Extract<keyof TOOLS, string> };
```

---

## Streaming Types

### UIMessageChunk (Streaming Protocol)

The main streaming protocol for UI updates:

```typescript
type UIMessageChunk<METADATA = unknown, DATA_TYPES extends UIDataTypes = UIDataTypes> =
  // Text streaming
  | { type: 'text-start'; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'text-delta'; delta: string; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'text-end'; id: string; providerMetadata?: ProviderMetadata }

  // Reasoning streaming
  | { type: 'reasoning-start'; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'reasoning-delta'; id: string; delta: string; providerMetadata?: ProviderMetadata }
  | { type: 'reasoning-end'; id: string; providerMetadata?: ProviderMetadata }

  // Error
  | { type: 'error'; errorText: string }

  // Tool operations
  | {
      type: 'tool-input-start';
      toolCallId: string;
      toolName: string;
      providerExecuted?: boolean;
      dynamic?: boolean;
      title?: string;
    }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | {
      type: 'tool-input-available';
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
      title?: string;
    }
  | {
      type: 'tool-input-error';
      toolCallId: string;
      toolName: string;
      input: unknown;
      providerExecuted?: boolean;
      providerMetadata?: ProviderMetadata;
      dynamic?: boolean;
      errorText: string;
      title?: string;
    }
  | { type: 'tool-approval-request'; approvalId: string; toolCallId: string }
  | {
      type: 'tool-output-available';
      toolCallId: string;
      output: unknown;
      providerExecuted?: boolean;
      dynamic?: boolean;
      preliminary?: boolean;
    }
  | {
      type: 'tool-output-error';
      toolCallId: string;
      errorText: string;
      providerExecuted?: boolean;
      dynamic?: boolean;
    }
  | { type: 'tool-output-denied'; toolCallId: string }

  // Sources
  | { type: 'source-url'; sourceId: string; url: string; title?: string; providerMetadata?: ProviderMetadata }
  | { type: 'source-document'; sourceId: string; mediaType: string; title: string; filename?: string; providerMetadata?: ProviderMetadata }

  // Files
  | { type: 'file'; url: string; mediaType: string; providerMetadata?: ProviderMetadata }

  // Custom data
  | DataUIMessageChunk<DATA_TYPES>

  // Step markers
  | { type: 'start-step' }
  | { type: 'finish-step' }

  // Message lifecycle
  | { type: 'start'; messageId?: string; messageMetadata?: METADATA }
  | { type: 'finish'; finishReason?: FinishReason; messageMetadata?: METADATA }
  | { type: 'abort'; reason?: string }
  | { type: 'message-metadata'; messageMetadata: METADATA };

type DataUIMessageChunk<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`;
    id?: string;
    data: DATA_TYPES[NAME];
    transient?: boolean;
  };
}>;
```

### TextStreamPart (Lower-level Streaming)

```typescript
type TextStreamPart<TOOLS extends ToolSet> =
  | { type: 'text-start'; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'text-end'; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'text-delta'; id: string; providerMetadata?: ProviderMetadata; text: string }
  | { type: 'reasoning-start'; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'reasoning-end'; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'reasoning-delta'; providerMetadata?: ProviderMetadata; id: string; text: string }
  | { type: 'tool-input-start'; id: string; toolName: string; providerMetadata?: ProviderMetadata; providerExecuted?: boolean; dynamic?: boolean; title?: string }
  | { type: 'tool-input-end'; id: string; providerMetadata?: ProviderMetadata }
  | { type: 'tool-input-delta'; id: string; delta: string; providerMetadata?: ProviderMetadata }
  | { type: 'source' } & Source
  | { type: 'file'; file: GeneratedFile }
  | { type: 'tool-call' } & TypedToolCall<TOOLS>
  | { type: 'tool-result' } & TypedToolResult<TOOLS>
  | { type: 'tool-error' } & TypedToolError<TOOLS>
  | { type: 'tool-output-denied' } & StaticToolOutputDenied<TOOLS>
  | ToolApprovalRequestOutput<TOOLS>
  | { type: 'start-step'; request: LanguageModelRequestMetadata; warnings: CallWarning[] }
  | { type: 'finish-step'; response: LanguageModelResponseMetadata; usage: LanguageModelUsage; finishReason: FinishReason; rawFinishReason: string | undefined; providerMetadata: ProviderMetadata | undefined }
  | { type: 'start' }
  | { type: 'finish'; finishReason: FinishReason; rawFinishReason: string | undefined; totalUsage: LanguageModelUsage }
  | { type: 'abort'; reason?: string }
  | { type: 'error'; error: unknown }
  | { type: 'raw'; rawValue: unknown };
```

### SSE Wire Format

The streaming protocol uses Server-Sent Events (SSE):

```typescript
// Each chunk is JSON-serialized and prefixed with "data: "
// Example wire format:
// data: {"type":"text-start","id":"abc123"}
//
// data: {"type":"text-delta","id":"abc123","delta":"Hello"}
//
// data: {"type":"text-delta","id":"abc123","delta":" world"}
//
// data: {"type":"text-end","id":"abc123"}
//
// data: {"type":"finish","finishReason":"stop"}
//
// data: [DONE]

// HTTP Headers:
const headers = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  'connection': 'keep-alive',
  'x-vercel-ai-ui-message-stream': 'v1',
  'x-accel-buffering': 'no',  // disable nginx buffering
};
```

---

## React Hook Types

### useChat

```typescript
type UseChatOptions<UI_MESSAGE extends UIMessage> = (
  | { chat: Chat<UI_MESSAGE> }
  | ChatInit<UI_MESSAGE>
) & {
  experimental_throttle?: number;
  resume?: boolean;
};

type UseChatHelpers<UI_MESSAGE extends UIMessage> = {
  readonly id: string;
  setMessages: (messages: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[])) => void;
  error: Error | undefined;
  sendMessage: (message: CreateUIMessage<UI_MESSAGE>, options?: ChatRequestOptions) => void;
  regenerate: (options?: ChatRequestOptions) => void;
  stop: () => void;
  resumeStream: () => void;
  addToolResult: (options: { toolCallId: string; output: unknown }) => void;
  addToolOutput: (options: { toolCallId: string; output: unknown }) => void;
  addToolApprovalResponse: (options: { id: string; approved: boolean; reason?: string }) => void;
  status: ChatStatus;
  messages: UI_MESSAGE[];
  clearError: () => void;
};
```

### useCompletion

```typescript
type UseCompletionOptions = {
  api?: string;
  id?: string;
  initialInput?: string;
  initialCompletion?: string;
  onFinish?: (prompt: string, completion: string) => void;
  onError?: (error: Error) => void;
  credentials?: RequestCredentials;
  headers?: Record<string, string> | Headers;
  body?: object;
  streamProtocol?: 'data' | 'text';
  fetch?: FetchFunction;
};

type UseCompletionHelpers = {
  completion: string;
  complete: (prompt: string, options?: CompletionRequestOptions) => Promise<string | null | undefined>;
  error: undefined | Error;
  stop: () => void;
  setCompletion: (completion: string) => void;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (event?: { preventDefault?: () => void }) => void;
  isLoading: boolean;
};
```

### useObject

```typescript
type Experimental_UseObjectOptions<SCHEMA extends FlexibleSchema, RESULT> = {
  api: string;
  schema: SCHEMA;
  id?: string;
  initialValue?: DeepPartial<RESULT>;
  fetch?: FetchFunction;
  onFinish?: (event: { object: RESULT | undefined; error: Error | undefined }) => void;
  onError?: (error: Error) => void;
  headers?: Resolvable<Record<string, string> | Headers>;
  credentials?: RequestCredentials;
};

type Experimental_UseObjectHelpers<RESULT, INPUT> = {
  submit: (input: INPUT) => void;
  object: DeepPartial<RESULT> | undefined;
  error: Error | undefined;
  isLoading: boolean;
  stop: () => void;
  clear: () => void;
};
```

---

## Metadata and Usage Types

### ProviderMetadata

```typescript
type ProviderMetadata = Record<string, Record<string, JSONValue | undefined>>;

// Example:
// {
//   "anthropic": { "cacheControl": { "type": "ephemeral" } },
//   "openai": { "systemFingerprint": "fp_abc123" }
// }
```

### LanguageModelUsage

```typescript
type LanguageModelUsage = {
  inputTokens: number | undefined;
  inputTokenDetails: {
    noCacheTokens: number | undefined;
    cacheReadTokens: number | undefined;
    cacheWriteTokens: number | undefined;
  };
  outputTokens: number | undefined;
  outputTokenDetails: {
    textTokens: number | undefined;
    reasoningTokens: number | undefined;
  };
  totalTokens: number | undefined;
  raw?: JSONObject;
};
```

### LanguageModelResponseMetadata

```typescript
type LanguageModelResponseMetadata = {
  id: string;
  timestamp: Date;
  modelId: string;
  headers?: Record<string, string>;
};
```

### LanguageModelRequestMetadata

```typescript
type LanguageModelRequestMetadata = {
  body?: unknown;
};
```

### FinishReason

```typescript
type FinishReason =
  | 'stop'           // model generated stop sequence
  | 'length'         // model generated maximum number of tokens
  | 'content-filter' // content filter violation
  | 'tool-calls'     // model triggered tool calls
  | 'error'          // model stopped due to error
  | 'other';         // other reasons
```

### CallWarning

```typescript
type CallWarning =
  | { type: 'unsupported'; feature: string; details?: string }
  | { type: 'compatibility'; feature: string; details?: string }
  | { type: 'other'; message: string };
```

---

## File and Attachment Types

### GeneratedFile

```typescript
interface GeneratedFile {
  readonly base64: string;
  readonly uint8Array: Uint8Array;
  readonly mediaType: string;
}
```

### GeneratedAudioFile

```typescript
interface GeneratedAudioFile extends GeneratedFile {
  readonly format: string;
}
```

### Source Types

```typescript
type Source = SourceUrl | SourceDocument;

type SourceUrl = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
};

type SourceDocument = {
  type: 'source-document';
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
};
```

---

## Chat State Types

### ChatStatus

```typescript
type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';
```

### ChatInit

```typescript
interface ChatInit<UI_MESSAGE extends UIMessage> {
  id?: string;
  messageMetadataSchema?: FlexibleSchema<InferUIMessageMetadata<UI_MESSAGE>>;
  dataPartSchemas?: UIDataTypesToSchemas<InferUIMessageData<UI_MESSAGE>>;
  messages?: UI_MESSAGE[];
  generateId?: IdGenerator;
  transport?: ChatTransport<UI_MESSAGE>;
  onError?: ChatOnErrorCallback;
  onToolCall?: ChatOnToolCallCallback<UI_MESSAGE>;
  onFinish?: ChatOnFinishCallback<UI_MESSAGE>;
  onData?: ChatOnDataCallback<UI_MESSAGE>;
  sendAutomaticallyWhen?: (options: { messages: UI_MESSAGE[] }) => boolean | PromiseLike<boolean>;
}
```

### ChatTransport

```typescript
interface ChatTransport<UI_MESSAGE extends UIMessage> {
  sendMessages: (options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UI_MESSAGE[];
    abortSignal: AbortSignal | undefined;
  } & ChatRequestOptions) => Promise<ReadableStream<UIMessageChunk>>;

  reconnectToStream: (options: {
    chatId: string;
  } & ChatRequestOptions) => Promise<ReadableStream<UIMessageChunk> | null>;
}
```

### Chat Callbacks

```typescript
type ChatOnErrorCallback = (error: Error) => void;

type ChatOnToolCallCallback<UI_MESSAGE extends UIMessage> = (options: {
  toolCall: InferUIMessageToolCall<UI_MESSAGE>;
}) => void | PromiseLike<void>;

type ChatOnFinishCallback<UI_MESSAGE extends UIMessage> = (options: {
  message: UI_MESSAGE;
  messages: UI_MESSAGE[];
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
  finishReason?: FinishReason;
}) => void;

type ChatOnDataCallback<UI_MESSAGE extends UIMessage> = (
  dataPart: DataUIPart<InferUIMessageData<UI_MESSAGE>>
) => void;

type ChatRequestOptions = {
  headers?: Record<string, string> | Headers;
  body?: object;
  metadata?: unknown;
};
```

---

## Translation Guide

### Converting Claude Code Output to AI SDK Format

When translating Claude Code (or similar agent) outputs to AI SDK format, follow these patterns:

#### 1. Text Content

```typescript
// Claude Code output
const claudeOutput = {
  type: 'text',
  text: 'Hello, world!'
};

// AI SDK UIMessage
const uiMessage: UIMessage = {
  id: generateId(),
  role: 'assistant',
  parts: [{
    type: 'text',
    text: 'Hello, world!',
    state: 'done'
  }]
};
```

#### 2. Tool Calls

**Static Tools** (known at compile time, like Claude Code's Write, Edit, Read, Bash, etc.):

```typescript
// Claude Code tool call - tools are known/static
const claudeToolCall = {
  type: 'tool_use',
  id: 'tool_123',
  name: 'Read',
  input: { file_path: '/src/index.ts' }
};

// AI SDK UIMessage with STATIC tool (use tool-${name} pattern)
const uiMessage: UIMessage = {
  id: generateId(),
  role: 'assistant',
  parts: [{
    type: 'tool-Read',  // Static: type is 'tool-{toolName}'
    toolCallId: 'tool_123',
    state: 'input-available',
    input: { file_path: '/src/index.ts' }
  }]
};
```

**Dynamic Tools** (not known at compile time):

```typescript
// Unknown/runtime tool
const dynamicToolCall = {
  type: 'tool_use',
  id: 'tool_456',
  name: 'custom_plugin_tool',
  input: { data: 'some data' }
};

// AI SDK UIMessage with DYNAMIC tool
const uiMessage: UIMessage = {
  id: generateId(),
  role: 'assistant',
  parts: [{
    type: 'dynamic-tool',  // Dynamic: type is always 'dynamic-tool'
    toolCallId: 'tool_456',
    toolName: 'custom_plugin_tool',  // toolName field required for dynamic
    state: 'input-available',
    input: { data: 'some data' }
  }]
};
```

#### 3. Tool Results

```typescript
// Static tool after execution (Claude Code example)
const uiMessageWithResult: UIMessage = {
  id: generateId(),
  role: 'assistant',
  parts: [{
    type: 'tool-Read',  // Static tool
    toolCallId: 'tool_123',
    state: 'output-available',
    input: { file_path: '/src/index.ts' },
    output: { content: 'file contents here...' }
  }]
};

// Dynamic tool after execution
const dynamicResult: UIMessage = {
  id: generateId(),
  role: 'assistant',
  parts: [{
    type: 'dynamic-tool',
    toolCallId: 'tool_456',
    toolName: 'custom_tool',  // Required for dynamic
    state: 'output-available',
    input: { data: 'input' },
    output: { result: 'output' }
  }]
};

// Tool with error
const toolError: UIMessage = {
  id: generateId(),
  role: 'assistant',
  parts: [{
    type: 'tool-Bash',
    toolCallId: 'tool_789',
    state: 'output-error',
    input: { command: 'invalid-cmd' },
    errorText: 'Command not found: invalid-cmd'
  }]
};
```

#### 4. Streaming Updates

```typescript
// Stream text delta
const textDelta: UIMessageChunk = {
  type: 'text-delta',
  id: 'text_part_1',
  delta: 'Hello'
};

// Stream tool input
const toolDelta: UIMessageChunk = {
  type: 'tool-input-start',
  toolCallId: 'tool_123',
  toolName: 'read_file',
  dynamic: true
};

// Tool input available
const toolReady: UIMessageChunk = {
  type: 'tool-input-available',
  toolCallId: 'tool_123',
  toolName: 'read_file',
  input: { path: '/src/index.ts' },
  dynamic: true
};

// Tool output
const toolOutput: UIMessageChunk = {
  type: 'tool-output-available',
  toolCallId: 'tool_123',
  output: { content: 'file contents...' },
  dynamic: true
};
```

#### 5. Thinking/Reasoning

```typescript
// Claude thinking block
const thinkingBlock = {
  type: 'thinking',
  thinking: 'Let me analyze this...'
};

// AI SDK reasoning part
const reasoningPart: ReasoningUIPart = {
  type: 'reasoning',
  text: 'Let me analyze this...',
  state: 'done'
};
```

#### 6. File Attachments

```typescript
// User message with file
const userMessage: UIMessage = {
  id: generateId(),
  role: 'user',
  parts: [
    { type: 'text', text: 'Please analyze this image' },
    { type: 'file', url: 'data:image/png;base64,...', mediaType: 'image/png' }
  ]
};
```

### Complete Message Translation Example

```typescript
// Known Claude Code tools (static)
const CLAUDE_CODE_TOOLS = new Set([
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'Task', 'WebFetch', 'WebSearch', 'TodoWrite', 'AskUserQuestion'
]);

// Translating a full Claude Code response
function translateClaudeCodeToAISdk(claudeResponse: ClaudeCodeMessage): UIMessage {
  const parts: UIMessagePart[] = [];

  for (const block of claudeResponse.content) {
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
        // Use static tool type for known Claude Code tools
        if (CLAUDE_CODE_TOOLS.has(block.name)) {
          parts.push({
            type: `tool-${block.name}` as const,  // e.g., 'tool-Read', 'tool-Write'
            toolCallId: block.id,
            state: 'input-available',
            input: block.input
          });
        } else {
          // Fall back to dynamic for unknown tools
          parts.push({
            type: 'dynamic-tool',
            toolCallId: block.id,
            toolName: block.name,
            state: 'input-available',
            input: block.input
          });
        }
        break;

      case 'tool_result':
        // Find and update the corresponding tool part (both static and dynamic have toolCallId)
        const toolPart = parts.find(
          p => 'toolCallId' in p && p.toolCallId === block.tool_use_id
        );

        if (toolPart && 'state' in toolPart) {
          toolPart.state = block.is_error ? 'output-error' : 'output-available';
          if (block.is_error) {
            (toolPart as any).errorText = String(block.content);
          } else {
            (toolPart as any).output = block.content;
          }
        }
        break;
    }
  }

  return {
    id: generateId(),
    role: claudeResponse.role === 'assistant' ? 'assistant' : 'user',
    parts
  };
}
```

---

## Quick Reference

### Essential Types for Frontend Rendering

| Type              | Use Case                                               |
| ----------------- | ------------------------------------------------------ |
| `UIMessage`       | Main message type for rendering                        |
| `UIMessagePart`   | Individual parts within a message                      |
| `UIMessageChunk`  | Streaming updates                                      |
| `ChatStatus`      | Chat state ('ready', 'streaming', 'submitted', 'error')|
| `FinishReason`    | Why generation stopped                                 |

### Tool State Lifecycle

```text
input-streaming → input-available → [approval-requested → approval-responded] → output-available
                                                                              ↘ output-error
                                                                              ↘ output-denied
```

### Streaming Lifecycle

```text
start → [text-start → text-delta* → text-end]* → [tool-input-start → tool-input-delta* → tool-input-available → tool-output-available]* → finish
```
