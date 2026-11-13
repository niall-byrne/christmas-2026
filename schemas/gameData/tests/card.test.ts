import { describe, expect, it } from "vitest"
import {
  BonusCardSchema,
  CardStateSchema,
  GameCardsSchema,
  GameCardsHashSchema,
} from "@/schemas/gameData/card"

describe("card schemas", () => {
  describe("BonusCardSchema", () => {
    it("accepts valid bonus card labels and trims whitespace", () => {
      expect(BonusCardSchema.parse("  Gold Crown  ")).toBe("Gold Crown")
      expect(BonusCardSchema.parse("b".repeat(80))).toBe("b".repeat(80))
    })

    it.each([
      ["empty string", ""],
      ["whitespace-only string", "   "],
      ["exceeding 80 chars", "b".repeat(81)],
      ["non-string", 42],
      ["undefined", undefined],
    ])("rejects %s with INVALID_BONUS_CARD", (_label, input) => {
      const result = BonusCardSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_BONUS_CARD")
      }
    })
  })

  describe("CardStateSchema", () => {
    it("parses and trims recipient and identifier", () => {
      expect(
        CardStateSchema.parse({
          recipient: "  Alice  ",
          identifier: "  Gold Star  ",
        })
      ).toEqual({
        recipient: "Alice",
        identifier: "Gold Star",
      })
    })
  })

  describe("GameCardsSchema", () => {
    it("accepts valid non-empty recipient/identifier arrays", () => {
      expect(
        GameCardsSchema.parse([
          { recipient: "Alice", identifier: "Gold Star" },
          { recipient: "Bob", identifier: "Pine Tree" },
        ])
      ).toEqual([
        { recipient: "Alice", identifier: "Gold Star" },
        { recipient: "Bob", identifier: "Pine Tree" },
      ])
    })

    it.each([
      ["empty array", []],
      ["non-array", "Alice"],
      ["missing identifier", [{ recipient: "Alice" }]],
      ["empty recipient", [{ recipient: "   ", identifier: "Gold Star" }]],
      [
        "duplicate case-insensitive recipients",
        [
          { recipient: "Alice", identifier: "Gold Star" },
          { recipient: "  alice ", identifier: "Snowflake" },
        ],
      ],
      [
        "duplicate recipients with extra internal whitespace",
        [
          { recipient: "Mary Jane", identifier: "Gold Star" },
          { recipient: "  mary   jane ", identifier: "Snowflake" },
        ],
      ],
    ])("rejects %s with INVALID_GAME_CARDS", (_label, input) => {
      const result = GameCardsSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_GAME_CARDS")
      }
    })
  })

  describe("GameCardsHashSchema", () => {
    it("parses JSON-encoded Redis card entries into CardState objects", () => {
      expect(
        GameCardsHashSchema.parse({
          alice: JSON.stringify({
            recipient: "Alice",
            identifier: "Gold Star",
          }),
          bob: JSON.stringify({ recipient: "Bob", identifier: "Pine Tree" }),
        })
      ).toEqual({
        alice: { recipient: "Alice", identifier: "Gold Star" },
        bob: { recipient: "Bob", identifier: "Pine Tree" },
      })
    })

    it("rejects malformed JSON or entries that fail CardStateSchema", () => {
      expect(
        GameCardsHashSchema.safeParse({
          alice: "{not-valid-json",
        }).success
      ).toBe(false)

      expect(
        GameCardsHashSchema.safeParse({
          alice: JSON.stringify({ recipient: "", identifier: "Gold Star" }),
        }).success
      ).toBe(false)
    })
  })
})
