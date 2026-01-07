# @sandcastle/petname

Generate memorable random names for worktrees and other resources.

Petnames are human-friendly identifiers like `brave-sunset` or `calm-river`. They're commonly used for:

- Git worktree names
- Container names (similar to Docker's naming scheme)
- Temporary resource identifiers
- Anything that needs a memorable, easy-to-type name

## Installation

```bash
bun add @sandcastle/petname
```

## Usage

### Simple API

```typescript
import { generate, petname } from "@sandcastle/petname";

// Generate a petname string
petname(); // "brave-fox"
petname({ wordCount: 3 }); // "calm-swift-river"
petname({ separator: "_" }); // "brave_fox"

// Get the full result with metadata
const result = generate();
// { name: "brave-fox", words: ["brave", "fox"] }
```

### Effect API

For applications using [Effect](https://effect.website/):

```typescript
import { Effect } from "effect";

import { PetnameService, PetnameServiceLive } from "@sandcastle/petname";

const program = Effect.gen(function* () {
  const service = yield* PetnameService;
  const pet = yield* service.generate({ wordCount: 2 });
  return pet.name;
});

const name = await Effect.runPromise(program.pipe(Effect.provide(PetnameServiceLive)));
```

## API Reference

### `petname(options?): string`

Generate a petname string.

**Options:**

- `wordCount` (default: 2) - Number of words in the name
- `separator` (default: "-") - Character(s) between words

**Returns:** A lowercase petname string

### `generate(options?): Petname`

Generate a petname with metadata.

**Returns:**

```typescript
interface Petname {
  name: string; // "brave-fox"
  words: readonly string[]; // ["brave", "fox"]
}
```

### `PetnameService`

Effect service for dependency injection.

```typescript
class PetnameService extends Context.Tag("PetnameService")<
  PetnameService,
  {
    generate: (options?) => Effect<Petname, InvalidWordCountError>;
  }
>() {}
```

## Word Pattern

Names follow the pattern: **adjective(s) + noun**

| Word Count | Pattern                  | Example            |
| ---------- | ------------------------ | ------------------ |
| 1          | noun                     | `fox`              |
| 2          | adjective-noun           | `brave-fox`        |
| 3          | adjective-adjective-noun | `calm-swift-river` |
| n          | (n-1) adjectives + noun  | ...                |

## Word Lists

The package includes curated word lists:

- **~160 adjectives**: common descriptive words (brave, calm, swift, etc.)
- **~220 nouns**: nature-themed and common nouns (fox, river, cloud, etc.)

Words are chosen for:

- Short length (3-8 characters)
- Easy to type and remember
- Positive/neutral connotations

## Randomness

Uses `crypto.getRandomValues()` for cryptographically secure random selection.

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
