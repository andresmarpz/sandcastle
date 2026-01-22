# Markdown Parsing Migration Plan

This document captures the current state of markdown parsing/rendering in the Sandcastle application and outlines the migration plan to use Rust-based markdown parsing (comrak) for the Tauri desktop application, similar to the approach in [OpenCode PR #10000](https://github.com/anomalyco/opencode/pull/10000).

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Target Architecture](#target-architecture)
3. [Migration Strategy](#migration-strategy)
4. [Implementation Details](#implementation-details)
5. [Files to Modify](#files-to-modify)
6. [Testing Plan](#testing-plan)
7. [Rollout Plan](#rollout-plan)

---

## Current Architecture

### Library Stack

| Library | Version | Purpose |
|---------|---------|---------|
| `streamdown` | 1.6.11 | Streaming markdown renderer (wraps remark internally) |
| `remark-breaks` | 4.0.0 | Converts line breaks to `<br>` elements |
| `shiki` | 3.21.0 | Syntax highlighting for code blocks |

### Streamdown Usage Locations

All markdown rendering flows through the `Streamdown` component from the `streamdown` library:

#### 1. `packages/ui/src/components/ai-elements/message.tsx` (Lines 14, 317-331)

The `MessageResponse` component wraps `Streamdown` and is used for AI assistant responses:

```tsx
import { Streamdown } from "streamdown";

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_ul]:pl-4 [&_ol]:pl-4 [&_li]:wrap-break-word",
        className,
      )}
      shikiTheme={["github-light", "github-dark"]}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
```

#### 2. `packages/ui/src/components/ai-elements/reasoning.tsx` (Lines 7, 178)

Used for AI thinking/reasoning display in collapsible panels:

```tsx
import { Streamdown } from "streamdown";

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => (
    <CollapsiblePanel ...>
      <Streamdown {...props}>{children}</Streamdown>
    </CollapsiblePanel>
  ),
);
```

#### 3. `packages/ui/src/features/chat/components/parts/plan-part.tsx` (Lines 5, 168)

Renders implementation plans:

```tsx
import { Streamdown } from "streamdown";

<Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
  {planContent}
</Streamdown>
```

#### 4. `packages/ui/src/features/chat/components/parts/subagent-part.tsx` (Lines 3, 122)

Renders subagent execution output:

```tsx
import { Streamdown } from "streamdown";

<Streamdown className="prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
  {outputText}
</Streamdown>
```

#### 5. `packages/ui/src/features/chat/components/parts/text-part.tsx` (Lines 1, 8)

Most basic usage - wraps text in MessageResponse:

```tsx
import { MessageResponse } from "@/components/ai-elements/message";

export function TextPart({ text }: TextPartProps) {
  return <MessageResponse>{text}</MessageResponse>;
}
```

### Current Rendering Pipeline

```
AI Response (markdown string)
    │
    ▼
TextPart / PlanPart / ReasoningContent / SubagentPart
    │
    ▼
MessageResponse (Streamdown wrapper) or direct Streamdown usage
    │
    ▼
Streamdown component processes markdown:
    ├── Parses with remark + remark-breaks
    ├── Syntax highlights code blocks with Shiki
    └── Renders to JSX
    │
    ▼
Theme context provides theme ("light" or "dark")
    │
    ▼
Shiki applies theme: github-light or github-dark
    │
    ▼
React renders styled HTML
```

### Code Block Highlighting (Separate System)

The `CodeBlock` component (`packages/ui/src/components/ai-elements/code-block.tsx`) uses Shiki directly for non-streaming code display:

- Uses `one-light` and `one-dark-pro` themes
- LRU cache (max 10 items) for performance
- Custom line number transformer
- Used in Tool component for JSON output

---

## Target Architecture

### OpenCode PR #10000 Approach

The OpenCode project moved markdown parsing from JavaScript (`marked`) to Rust (`comrak`) with significant performance gains:

| Document Size | JavaScript | Rust | Speedup |
|---------------|------------|------|---------|
| Small | 3.78x faster | - | JS wins |
| Medium | - | 10.39x faster | Rust wins |
| Large | - | 32.57x faster | Rust wins |

### Key Implementation Pattern

#### Rust Side (`packages/desktop/src-tauri/src/markdown.rs`)

```rust
use comrak::{markdown_to_html, Options};

pub fn parse_markdown(input: &str) -> String {
    let mut options = Options::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    options.render.r#unsafe = true;  // Allow raw HTML pass-through

    markdown_to_html(input, &options)
}

#[tauri::command]
pub async fn parse_markdown_command(markdown: String) -> Result<String, String> {
    Ok(parse_markdown(&markdown))
}
```

#### TypeScript Side (Platform Provider)

```typescript
// In platform context interface
parseMarkdown?(markdown: string): Promise<string>

// In desktop main.tsx
const parseMarkdown = async (markdown: string) => {
    return invoke<string>("parse_markdown_command", { markdown })
}
```

#### Provider Composition

```typescript
function MarkedProviderWithNativeParser(props: ParentProps) {
    const platform = usePlatform()
    return <MarkedProvider nativeParser={platform.parseMarkdown}>
        {props.children}
    </MarkedProvider>
}
```

---

## Migration Strategy

### Phase 1: Platform Provider Extension

Extend the existing `PlatformProvider` pattern to include markdown parsing:

```typescript
// packages/ui/src/context/platform-context.tsx
interface PlatformContextValue {
  openDirectory: () => Promise<string | null>;
  openInFileManager?: ((path: string) => Promise<void>) | null;
  openInEditor?: ((path: string) => Promise<void>) | null;
  copyToClipboard?: ((text: string) => Promise<void>) | null;
  // NEW: Native markdown parsing (Tauri only)
  parseMarkdown?: ((markdown: string) => Promise<string>) | null;
}
```

### Phase 2: Rust Markdown Module

Add comrak to the Tauri application:

```toml
# apps/desktop/src-tauri/Cargo.toml
[dependencies]
comrak = { version = "0.50", default-features = false }
```

Create new module:

```
apps/desktop/src-tauri/src/markdown.rs
```

Register command in `lib.rs`:

```rust
mod markdown;
// ...
.invoke_handler(tauri::generate_handler![greet, get_server_port, markdown::parse_markdown_command])
```

### Phase 3: Hybrid Markdown Component

Create a new component that uses native parsing when available:

```typescript
// packages/ui/src/components/ai-elements/native-markdown.tsx
import { usePlatform } from "@/context/platform-context";

export function NativeMarkdown({ children, fallback: Fallback }) {
  const { parseMarkdown } = usePlatform();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (parseMarkdown && children) {
      parseMarkdown(children).then(setHtml);
    }
  }, [parseMarkdown, children]);

  // Use native HTML if available, otherwise fall back to Streamdown
  if (html && parseMarkdown) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return <Fallback>{children}</Fallback>;
}
```

### Phase 4: Post-Processing (Syntax Highlighting)

Syntax highlighting and KaTeX remain in JavaScript post-processing (as in OpenCode PR):

- Parse markdown to HTML in Rust (fast)
- Apply syntax highlighting with Shiki in JS (necessary for theming)
- Optionally apply KaTeX for math rendering

---

## Implementation Details

### Current Tauri Setup

The Tauri application is already well-structured for adding new commands:

**File: `apps/desktop/src-tauri/src/lib.rs`**

```rust
mod sidecar;
use sidecar::SidecarState;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn get_server_port(state: tauri::State<'_, SidecarState>) -> Result<Option<u16>, String> {
    Ok(state.get_port().await)
}

// ... invoke_handler includes these commands
.invoke_handler(tauri::generate_handler![greet, get_server_port])
```

**File: `apps/desktop/src-tauri/Cargo.toml`**

Current dependencies:
- tauri 2
- tauri-plugin-dialog 2
- tauri-plugin-shell 2
- tauri-plugin-updater 2
- tauri-plugin-process 2
- serde, serde_json
- reqwest (with rustls-tls)
- tokio (with sync, time)
- cocoa (macOS only)

### Desktop Entry Point

**File: `apps/desktop/src/main.tsx`**

Already using the platform provider pattern:

```tsx
const App = () => (
  <PlatformProvider
    openDirectory={openDirectory}
    openInFileManager={openInFileManager}
    openInEditor={openInEditor}
    copyToClipboard={copyToClipboard}
    // NEW: Add parseMarkdown here
  >
    <UpdaterProvider>
      <Layout />
    </UpdaterProvider>
  </PlatformProvider>
);
```

### Comrak Options to Consider

```rust
let mut options = Options::default();

// Extensions
options.extension.strikethrough = true;     // ~~text~~
options.extension.table = true;             // GFM tables
options.extension.tasklist = true;          // - [x] tasks
options.extension.autolink = true;          // Auto-link URLs
options.extension.footnotes = true;         // [^1] footnotes
options.extension.description_lists = true; // Definition lists

// Rendering
options.render.r#unsafe = true;             // Allow raw HTML
options.render.hardbreaks = true;           // Treat newlines as <br>
options.render.github_pre_lang = true;      // Use language class on <pre>
```

---

## Files to Modify

### Rust (Tauri)

| File | Action | Description |
|------|--------|-------------|
| `apps/desktop/src-tauri/Cargo.toml` | Modify | Add `comrak` dependency |
| `apps/desktop/src-tauri/src/markdown.rs` | Create | New markdown parsing module |
| `apps/desktop/src-tauri/src/lib.rs` | Modify | Register markdown command |

### TypeScript (UI Package)

| File | Action | Description |
|------|--------|-------------|
| `packages/ui/src/context/platform-context.tsx` | Modify | Add `parseMarkdown` to interface |
| `apps/desktop/src/main.tsx` | Modify | Provide `parseMarkdown` implementation |
| `packages/ui/src/components/ai-elements/native-markdown.tsx` | Create | Hybrid component with fallback |
| `packages/ui/src/components/ai-elements/message.tsx` | Modify | Use NativeMarkdown in MessageResponse |

### Optional Updates

| File | Action | Description |
|------|--------|-------------|
| `packages/ui/src/components/ai-elements/reasoning.tsx` | Modify | Use NativeMarkdown |
| `packages/ui/src/features/chat/components/parts/plan-part.tsx` | Modify | Use NativeMarkdown |
| `packages/ui/src/features/chat/components/parts/subagent-part.tsx` | Modify | Use NativeMarkdown |

---

## Testing Plan

### Unit Tests

1. **Rust markdown parsing**
   - Test basic markdown elements (headings, lists, code blocks, tables)
   - Test GFM extensions (strikethrough, task lists, autolinks)
   - Test edge cases (empty input, very large input, malformed markdown)

2. **TypeScript integration**
   - Test platform provider with parseMarkdown
   - Test fallback behavior when parseMarkdown is null (web platform)

### Performance Benchmarks

Following OpenCode's approach:

```typescript
// Small document (~100 chars)
const smallDoc = "# Hello\n\nThis is **bold** and *italic*.";

// Medium document (~1KB)
const mediumDoc = // ... typical AI response

// Large document (~10KB)
const largeDoc = // ... long code documentation
```

Measure:
- Parse time for each size
- Memory usage
- Compare JS (Streamdown) vs Rust (comrak)

### Visual Regression Tests

Ensure rendered output matches between:
- Current Streamdown rendering
- New comrak rendering

Elements to verify:
- Headings (h1-h6)
- Lists (ordered, unordered, nested)
- Code blocks (inline and fenced)
- Tables
- Links and images
- Blockquotes
- Horizontal rules
- Task lists
- Strikethrough

---

## Rollout Plan

### Step 1: Infrastructure

1. Add comrak to Cargo.toml
2. Create markdown.rs module
3. Register Tauri command
4. Extend PlatformProvider interface

### Step 2: Desktop Integration

1. Implement parseMarkdown in desktop main.tsx
2. Verify Tauri invoke works correctly

### Step 3: Hybrid Component

1. Create NativeMarkdown component
2. Add fallback to Streamdown
3. Test in isolation

### Step 4: Gradual Migration

1. Update MessageResponse to use NativeMarkdown
2. Monitor for issues
3. Update remaining components (reasoning, plan-part, subagent-part)

### Step 5: Post-Processing Integration

1. Add Shiki syntax highlighting to NativeMarkdown
2. Ensure theme switching works
3. Consider caching strategies

### Step 6: Cleanup (Optional)

1. Remove Streamdown dependency (if fully migrated)
2. Remove remark-breaks dependency
3. Update documentation

---

## Open Questions

1. **Streaming Support**: Streamdown supports streaming markdown. How should we handle streaming with native parsing?
   - Option A: Buffer chunks and re-parse periodically
   - Option B: Keep Streamdown for streaming, use native for final render
   - Option C: Implement incremental parsing in Rust

2. **Syntax Highlighting**: Should we also move syntax highlighting to Rust?
   - Shiki is well-optimized and theme-aware
   - Moving to Rust would require porting themes or using tree-sitter
   - Recommendation: Keep Shiki for now

3. **Web Platform Fallback**: How should the web version behave?
   - Keep Streamdown as fallback (current plan)
   - Use WASM-compiled comrak
   - Recommendation: Keep Streamdown for simplicity

4. **Error Handling**: How to handle parse failures?
   - Return original markdown as-is
   - Display error message
   - Fall back to Streamdown

---

## References

- [OpenCode PR #10000](https://github.com/anomalyco/opencode/pull/10000) - Reference implementation
- [comrak crate](https://docs.rs/comrak) - Rust markdown parser
- [Streamdown npm](https://www.npmjs.com/package/streamdown) - Current JS markdown renderer
- [Shiki](https://shiki.style/) - Syntax highlighter

---

## Appendix: Current File Locations

### Markdown-Related Components

```
packages/ui/src/
├── components/
│   └── ai-elements/
│       ├── message.tsx          # MessageResponse (Streamdown wrapper)
│       ├── reasoning.tsx        # ReasoningContent (Streamdown)
│       └── code-block.tsx       # CodeBlock (Shiki, separate from Streamdown)
├── context/
│   └── platform-context.tsx     # Platform abstraction layer
└── features/
    └── chat/
        └── components/
            └── parts/
                ├── text-part.tsx     # Uses MessageResponse
                ├── plan-part.tsx     # Direct Streamdown usage
                └── subagent-part.tsx # Direct Streamdown usage
```

### Tauri Application

```
apps/desktop/
├── src/
│   └── main.tsx                 # Desktop entry, PlatformProvider usage
└── src-tauri/
    ├── Cargo.toml               # Rust dependencies
    └── src/
        ├── lib.rs               # Tauri commands registration
        ├── main.rs              # Entry point
        └── sidecar.rs           # Sidecar management
```

---

## Planning: Parallel Work Streams

This migration can be split into **4 independent work streams** that can be executed in parallel. Each stream has a clear boundary and can be worked on by a separate Claude session.

### Work Stream Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PARALLEL WORK STREAMS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  STREAM A    │   │  STREAM B    │   │  STREAM C    │   │  STREAM D    │ │
│  │              │   │              │   │              │   │              │ │
│  │    Rust      │   │  Platform    │   │  Frontend    │   │   Testing    │ │
│  │   Backend    │   │  Provider    │   │  Component   │   │     &        │ │
│  │              │   │  Extension   │   │  Migration   │   │  Benchmarks  │ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────────────┘ │
│         │                  │                  │                             │
│         └──────────────────┼──────────────────┘                             │
│                            │                                                │
│                            ▼                                                │
│                   ┌──────────────┐                                          │
│                   │ INTEGRATION  │                                          │
│                   │    PHASE     │                                          │
│                   └──────────────┘                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Stream A: Rust Backend (Tauri/comrak)

**Owner**: Rust-focused session
**Dependency**: None (can start immediately)
**Estimated Scope**: Small (~100 lines of Rust)

#### Objective

Implement the `parse_markdown_command` Tauri command using comrak.

#### Files to Create/Modify

| File | Action |
|------|--------|
| `apps/desktop/src-tauri/Cargo.toml` | Add comrak dependency |
| `apps/desktop/src-tauri/src/markdown.rs` | Create new module |
| `apps/desktop/src-tauri/src/lib.rs` | Register command |

#### Deliverables

1. `markdown.rs` module with:
   - `parse_markdown(input: &str) -> String` function
   - `#[tauri::command] parse_markdown_command` async command
   - Proper comrak options (GFM extensions, unsafe HTML)

2. Command registered in `lib.rs`

3. Basic Rust tests for the parsing function

#### Contract (Interface)

```rust
#[tauri::command]
pub async fn parse_markdown_command(markdown: String) -> Result<String, String>
```

The command receives a markdown string and returns HTML string.

#### Reference Implementation

See OpenCode PR for exact comrak configuration:
- `options.extension.strikethrough = true`
- `options.extension.table = true`
- `options.extension.tasklist = true`
- `options.extension.autolink = true`
- `options.render.unsafe = true`

---

### Stream B: Platform Provider Extension

**Owner**: TypeScript-focused session
**Dependency**: None (can start immediately)
**Estimated Scope**: Small (~50 lines of TypeScript)

#### Objective

Extend the `PlatformProvider` pattern to support an optional `parseMarkdown` function.

#### Files to Modify

| File | Action |
|------|--------|
| `packages/ui/src/context/platform-context.tsx` | Add parseMarkdown to interface |
| `apps/desktop/src/main.tsx` | Implement parseMarkdown using Tauri invoke |

#### Deliverables

1. Updated `PlatformContextValue` interface:
   ```typescript
   interface PlatformContextValue {
     // ... existing fields
     parseMarkdown?: ((markdown: string) => Promise<string>) | null;
   }
   ```

2. Desktop implementation using Tauri invoke:
   ```typescript
   const parseMarkdown = async (markdown: string) => {
     return invoke<string>("parse_markdown_command", { markdown });
   };
   ```

3. **Stub for parallel development**: Until Stream A is complete, use a stub:
   ```typescript
   // TEMPORARY: Replace with Tauri invoke when Rust backend is ready
   const parseMarkdown = async (markdown: string) => {
     // Stub: just wrap in <p> tags for testing
     return `<p>${markdown}</p>`;
   };
   ```

#### Contract (Interface)

```typescript
parseMarkdown?: ((markdown: string) => Promise<string>) | null
```

Returns `null` on web platform, function on desktop.

---

### Stream C: Frontend Component Migration

**Owner**: React/UI-focused session
**Dependency**: Stream B interface must be defined (not implemented)
**Estimated Scope**: Medium (~200 lines of TypeScript/React)

#### Objective

Create the `NativeMarkdown` component and migrate existing Streamdown usages.

#### Files to Create/Modify

| File | Action |
|------|--------|
| `packages/ui/src/components/ai-elements/native-markdown.tsx` | Create new component |
| `packages/ui/src/components/ai-elements/message.tsx` | Update MessageResponse |
| `packages/ui/src/components/ai-elements/reasoning.tsx` | Update to use NativeMarkdown |
| `packages/ui/src/features/chat/components/parts/plan-part.tsx` | Update to use NativeMarkdown |
| `packages/ui/src/features/chat/components/parts/subagent-part.tsx` | Update to use NativeMarkdown |

#### Deliverables

1. **`NativeMarkdown` component** with:
   - Uses `usePlatform()` to get `parseMarkdown`
   - Falls back to Streamdown when `parseMarkdown` is null
   - Handles loading states
   - Applies Shiki syntax highlighting to code blocks in HTML output
   - Proper memoization for performance

2. **Updated `MessageResponse`** to use NativeMarkdown internally

3. **Migration of all Streamdown usages** to the new component

#### Contract (Interface)

```typescript
interface NativeMarkdownProps {
  children: string;
  className?: string;
  // Shiki theme for code highlighting
  shikiTheme?: [string, string]; // [light, dark]
}

export function NativeMarkdown(props: NativeMarkdownProps): JSX.Element
```

#### Key Implementation Notes

- **Code block post-processing**: The HTML from comrak will have `<pre><code class="language-xxx">` blocks. These need Shiki highlighting applied client-side.
- **Theme detection**: Use existing theme context to select light/dark theme.
- **Streaming consideration**: For now, only use native parsing for complete (non-streaming) content. Keep Streamdown for streaming scenarios.

#### Stub for Parallel Development

Until Stream B is complete, mock the platform context:

```typescript
// In tests or development
const mockPlatform = {
  parseMarkdown: async (md: string) => `<div>${md}</div>`,
  // ... other fields
};
```

---

### Stream D: Testing & Benchmarks

**Owner**: QA/Testing-focused session
**Dependency**: None (can start immediately, tests will fail until other streams complete)
**Estimated Scope**: Medium (~150 lines)

#### Objective

Create comprehensive tests and performance benchmarks.

#### Files to Create

| File | Action |
|------|--------|
| `apps/desktop/src-tauri/src/markdown.test.rs` | Rust unit tests |
| `packages/ui/src/components/ai-elements/native-markdown.test.tsx` | Component tests |
| `packages/ui/src/lib/markdown-benchmark.ts` | Performance benchmarks |

#### Deliverables

1. **Rust unit tests** for markdown parsing:
   - Basic elements (headings, lists, code blocks)
   - GFM extensions (tables, task lists, strikethrough)
   - Edge cases (empty, large, malformed)

2. **React component tests** for NativeMarkdown:
   - Renders correctly with native parser
   - Falls back to Streamdown correctly
   - Handles loading states
   - Memoization works correctly

3. **Performance benchmarks**:
   - Small document (~100 chars)
   - Medium document (~1KB)
   - Large document (~10KB)
   - Compare JS vs Rust parsing times

4. **Visual regression test cases** (manual checklist):
   - All markdown elements render identically

#### Benchmark Template

```typescript
// packages/ui/src/lib/markdown-benchmark.ts
export const benchmarkDocuments = {
  small: "# Hello\n\nThis is **bold** and *italic*.",
  medium: `# API Documentation

## Overview

This API provides...

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /users | List users |
| POST | /users | Create user |

\`\`\`typescript
const response = await fetch('/api/users');
const users = await response.json();
\`\`\`
`,
  large: // ... 10KB document with code blocks, tables, lists
};

export async function runBenchmark(
  parseMarkdown: (md: string) => Promise<string>
) {
  const results = {};
  for (const [size, doc] of Object.entries(benchmarkDocuments)) {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      await parseMarkdown(doc);
    }
    results[size] = (performance.now() - start) / 100;
  }
  return results;
}
```

---

### Integration Phase

**Owner**: Any session, after Streams A, B, C complete
**Dependency**: All parallel streams must be complete

#### Objective

Wire everything together and verify end-to-end functionality.

#### Tasks

1. Remove stub from Stream B, connect to real Tauri command
2. Run full test suite
3. Run performance benchmarks
4. Manual visual regression testing
5. Clean up any temporary code

#### Verification Checklist

- [ ] `bun i` succeeds
- [ ] `bun biome` passes
- [ ] `bun typecheck` passes
- [ ] Desktop app starts and renders markdown
- [ ] Web app falls back to Streamdown correctly
- [ ] All markdown elements render correctly
- [ ] Code blocks have syntax highlighting
- [ ] Theme switching works
- [ ] Performance is improved for medium/large documents

---

### Stream Dependencies Diagram

```
Stream A (Rust)          Stream B (Provider)       Stream C (Frontend)       Stream D (Tests)
     │                         │                         │                         │
     │                         │                         │                         │
     ▼                         ▼                         ▼                         ▼
┌─────────────┐          ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ Add comrak  │          │ Define      │          │ Create      │          │ Write test  │
│ dependency  │          │ interface   │◄─────────│ NativeMarkdown│         │ scaffolds   │
└─────────────┘          └─────────────┘          │ with stub   │          └─────────────┘
     │                         │                  └─────────────┘                │
     ▼                         ▼                         │                       │
┌─────────────┐          ┌─────────────┐                │                       │
│ Create      │          │ Add stub    │                │                       │
│ markdown.rs │          │ implementation│               │                       │
└─────────────┘          └─────────────┘                │                       │
     │                         │                         │                       │
     ▼                         ▼                         ▼                       │
┌─────────────┐          ┌─────────────┐          ┌─────────────┐                │
│ Register    │          │ Wire to     │◄─────────│ Migrate all │                │
│ command     │─────────►│ Tauri invoke│          │ components  │                │
└─────────────┘          └─────────────┘          └─────────────┘                │
     │                         │                         │                       │
     └─────────────────────────┴─────────────────────────┴───────────────────────┘
                                         │
                                         ▼
                               ┌─────────────────┐
                               │  INTEGRATION    │
                               │  - Connect all  │
                               │  - Run tests    │
                               │  - Benchmark    │
                               └─────────────────┘
```

---

### Quick Start for Each Stream

#### Stream A (Rust)
```bash
cd apps/desktop/src-tauri
# Read lib.rs to understand current setup
# Add comrak to Cargo.toml
# Create src/markdown.rs
# Register command in lib.rs
cargo build
cargo test
```

#### Stream B (Platform Provider)
```bash
cd packages/ui
# Read src/context/platform-context.tsx
# Add parseMarkdown to interface
# Read apps/desktop/src/main.tsx
# Add parseMarkdown implementation with stub
bun typecheck
```

#### Stream C (Frontend)
```bash
cd packages/ui
# Read src/components/ai-elements/message.tsx for current Streamdown usage
# Create src/components/ai-elements/native-markdown.tsx
# Update all Streamdown usages
bun typecheck
```

#### Stream D (Tests)
```bash
# Create test files with failing tests (TDD approach)
# Tests will pass as other streams complete
bun test
```
