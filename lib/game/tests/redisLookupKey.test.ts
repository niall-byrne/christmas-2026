import { describe, expect, it } from "vitest"
import { redisLookupKey } from "@/lib/game/redisLookupKey"

describe("redisLookupKey", () => {
  it("trims surrounding whitespace, collapses internal whitespace, and converts to lowercase", () => {
    expect(redisLookupKey("  AlIcE  ")).toBe("alice")
    expect(redisLookupKey("RED   PANDAS")).toBe("red pandas")
    expect(redisLookupKey("  Mary  \t  Jane  ")).toBe("mary jane")
    expect(redisLookupKey("\t#EF4444\n")).toBe("#ef4444")
    expect(redisLookupKey("already-normalized")).toBe("already-normalized")
  })
})
