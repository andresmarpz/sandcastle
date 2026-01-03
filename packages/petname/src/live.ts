import { Effect, Layer } from "effect"
import { PetnameService } from "./service.ts"
import { InvalidWordCountError } from "./errors.ts"
import { adjectives, nouns } from "./words.ts"
import type { GenerateOptions, Petname } from "./types.ts"

const DEFAULT_WORD_COUNT = 2
const DEFAULT_SEPARATOR = "-"

/**
 * Get a cryptographically random integer in range [0, max)
 */
function randomInt(max: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0]! % max
}

/**
 * Pick a random element from an array
 */
function randomElement<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)]!
}

/**
 * Generate words following the pattern: adjective(s) + noun
 *
 * - 1 word: noun (e.g., "fox")
 * - 2 words: adjective-noun (e.g., "brave-fox")
 * - 3 words: adjective-adjective-noun (e.g., "brave-swift-fox")
 * - n words: (n-1) adjectives + noun
 */
function generateWords(count: number): string[] {
  if (count === 1) {
    return [randomElement(nouns)]
  }

  const words: string[] = []
  for (let i = 0; i < count - 1; i++) {
    words.push(randomElement(adjectives))
  }
  words.push(randomElement(nouns))
  return words
}

const make = PetnameService.of({
  generate: (options?: GenerateOptions) =>
    Effect.gen(function* () {
      const wordCount = options?.wordCount ?? DEFAULT_WORD_COUNT
      const separator = options?.separator ?? DEFAULT_SEPARATOR

      if (wordCount < 1) {
        return yield* Effect.fail(
          new InvalidWordCountError({
            wordCount,
            message: `Word count must be at least 1, got ${wordCount}`,
          })
        )
      }

      const words = generateWords(wordCount)
      const name = words.join(separator)

      return { name, words } satisfies Petname
    }),
})

/**
 * Live implementation of PetnameService
 */
export const PetnameServiceLive = Layer.succeed(PetnameService, make)

/**
 * Generate a petname without Effect.
 *
 * @param options - Configuration for the generated name
 * @returns A Petname object with the name and its constituent words
 * @throws Error if wordCount is less than 1
 *
 * @example
 * ```ts
 * const pet = generate()
 * // { name: "brave-fox", words: ["brave", "fox"] }
 *
 * const pet3 = generate({ wordCount: 3 })
 * // { name: "calm-swift-river", words: ["calm", "swift", "river"] }
 * ```
 */
export function generate(options?: GenerateOptions): Petname {
  const wordCount = options?.wordCount ?? DEFAULT_WORD_COUNT
  const separator = options?.separator ?? DEFAULT_SEPARATOR

  if (wordCount < 1) {
    throw new Error(`Word count must be at least 1, got ${wordCount}`)
  }

  const words = generateWords(wordCount)
  const name = words.join(separator)

  return { name, words }
}

/**
 * Generate just the petname string.
 *
 * @param options - Configuration for the generated name
 * @returns The petname string (e.g., "brave-fox")
 * @throws Error if wordCount is less than 1
 *
 * @example
 * ```ts
 * petname()           // "brave-fox"
 * petname({ wordCount: 3 })  // "calm-swift-river"
 * petname({ separator: "_" }) // "brave_fox"
 * ```
 */
export function petname(options?: GenerateOptions): string {
  return generate(options).name
}
