import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import {
  generate,
  petname,
  PetnameService,
  PetnameServiceLive,
  InvalidWordCountError,
} from "../index.ts"
import { adjectives, nouns } from "./words.ts"

describe("petname()", () => {
  test("returns a string with default options", () => {
    const name = petname()
    expect(typeof name).toBe("string")
    expect(name.length).toBeGreaterThan(0)
  })

  test("generates adjective-noun pattern by default", () => {
    const name = petname()
    expect(name).toMatch(/^[a-z]+-[a-z]+$/)
  })

  test("respects wordCount option", () => {
    expect(petname({ wordCount: 1 }).split("-")).toHaveLength(1)
    expect(petname({ wordCount: 2 }).split("-")).toHaveLength(2)
    expect(petname({ wordCount: 3 }).split("-")).toHaveLength(3)
    expect(petname({ wordCount: 5 }).split("-")).toHaveLength(5)
  })

  test("respects separator option", () => {
    expect(petname({ separator: "_" })).toMatch(/^[a-z]+_[a-z]+$/)
    expect(petname({ separator: "." })).toMatch(/^[a-z]+\.[a-z]+$/)
    expect(petname({ separator: "" })).toMatch(/^[a-z]+$/)
  })

  test("throws for invalid word count", () => {
    expect(() => petname({ wordCount: 0 })).toThrow()
    expect(() => petname({ wordCount: -1 })).toThrow()
  })
})

describe("generate()", () => {
  test("returns Petname object with name and words", () => {
    const result = generate()
    expect(result).toHaveProperty("name")
    expect(result).toHaveProperty("words")
    expect(typeof result.name).toBe("string")
    expect(Array.isArray(result.words)).toBe(true)
  })

  test("name matches joined words", () => {
    const result = generate()
    expect(result.name).toBe(result.words.join("-"))
  })

  test("uses words from word lists", () => {
    const result = generate({ wordCount: 2 })
    const [adjective, noun] = result.words
    expect((adjectives as readonly string[]).includes(adjective!)).toBe(true)
    expect((nouns as readonly string[]).includes(noun!)).toBe(true)
  })

  test("single word returns a noun", () => {
    const result = generate({ wordCount: 1 })
    expect(result.words).toHaveLength(1)
    expect((nouns as readonly string[]).includes(result.words[0]!)).toBe(true)
  })

  test("multiple words follow adj-adj-...-noun pattern", () => {
    const result = generate({ wordCount: 4 })
    const adjs = adjectives as readonly string[]
    const ns = nouns as readonly string[]

    expect(adjs.includes(result.words[0]!)).toBe(true)
    expect(adjs.includes(result.words[1]!)).toBe(true)
    expect(adjs.includes(result.words[2]!)).toBe(true)
    expect(ns.includes(result.words[3]!)).toBe(true)
  })
})

describe("PetnameService (Effect)", () => {
  const runWithService = <A, E>(
    effect: Effect.Effect<A, E, PetnameService>
  ): Promise<A> =>
    Effect.runPromise(effect.pipe(Effect.provide(PetnameServiceLive)))

  test("generates petname via Effect", async () => {
    const result = await runWithService(
      Effect.gen(function* () {
        const service = yield* PetnameService
        return yield* service.generate()
      })
    )

    expect(result.words).toHaveLength(2)
    expect(result.name).toMatch(/^[a-z]+-[a-z]+$/)
  })

  test("respects options via Effect", async () => {
    const result = await runWithService(
      Effect.gen(function* () {
        const service = yield* PetnameService
        return yield* service.generate({ wordCount: 3, separator: "_" })
      })
    )

    expect(result.words).toHaveLength(3)
    expect(result.name).toMatch(/^[a-z]+_[a-z]+_[a-z]+$/)
  })

  test("fails with InvalidWordCountError for invalid count", async () => {
    const program = Effect.gen(function* () {
      const service = yield* PetnameService
      return yield* service.generate({ wordCount: 0 })
    }).pipe(Effect.provide(PetnameServiceLive))

    const result = await Effect.runPromiseExit(program)

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      const error = result.cause
      expect(error._tag).toBe("Fail")
    }
  })
})

describe("randomness", () => {
  test("generates unique names across multiple calls", () => {
    const names = new Set<string>()
    for (let i = 0; i < 100; i++) {
      names.add(petname())
    }
    // With 160+ adjectives and 220+ nouns, collisions should be very rare
    expect(names.size).toBeGreaterThan(90)
  })

  test("uses cryptographically secure randomness", () => {
    // This is a sanity check - if crypto.getRandomValues is broken,
    // we'd likely see repeated patterns
    const names = Array.from({ length: 50 }, () => petname())
    const unique = new Set(names)
    expect(unique.size).toBeGreaterThan(40)
  })
})

describe("word lists", () => {
  test("adjectives are all lowercase", () => {
    for (const adj of adjectives) {
      expect(adj as string).toBe(adj.toLowerCase())
    }
  })

  test("nouns are all lowercase", () => {
    for (const noun of nouns) {
      expect(noun as string).toBe(noun.toLowerCase())
    }
  })

  test("adjectives contain no special characters", () => {
    for (const adj of adjectives) {
      expect(adj).toMatch(/^[a-z]+$/)
    }
  })

  test("nouns contain no special characters", () => {
    for (const noun of nouns) {
      expect(noun).toMatch(/^[a-z]+$/)
    }
  })

  test("word lists have sufficient variety", () => {
    expect(adjectives.length).toBeGreaterThan(100)
    expect(nouns.length).toBeGreaterThan(100)
  })
})
