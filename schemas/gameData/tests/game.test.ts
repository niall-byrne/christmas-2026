import { describe, expect, it } from "vitest"
import {
  GameNameSchema,
  GameLevelSchema,
  CreateGameBodySchema,
  UpdateGameBodySchema,
  GameParamsSchema,
  GameHashSchema,
} from "@/schemas/gameData/game"

const VALID_GAME_ID = "a1b2c3d4e5f6g7h8i9j0k1l2"

describe("game schemas", () => {
  describe("GameNameSchema", () => {
    it("accepts valid names and trims surrounding whitespace", () => {
      expect(GameNameSchema.parse("  Friday Trivia  ")).toBe("Friday Trivia")
      expect(GameNameSchema.parse("A")).toBe("A")
      expect(GameNameSchema.parse("x".repeat(80))).toBe("x".repeat(80))
    })

    it.each([
      ["empty string", ""],
      ["whitespace-only string", "   \t\n  "],
      ["name exceeding 80 chars", "x".repeat(81)],
      ["non-string input", 123],
      ["undefined", undefined],
    ])("rejects %s with INVALID_GAME_NAME", (_label, input) => {
      const result = GameNameSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_GAME_NAME")
      }
    })
  })

  describe("GameLevelSchema", () => {
    it.each([0, 1, 2, 3, 4, 5])("accepts valid integer level %i", (level) => {
      expect(GameLevelSchema.parse(level)).toBe(level)
    })

    it.each([
      ["negative integer", -1],
      ["integer above 5", 6],
      ["float", 2.5],
      ["numeric string", "1"],
      ["NaN", Number.NaN],
      ["null", null],
    ])("rejects %s with INVALID_LEVEL", (_label, input) => {
      const result = GameLevelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_LEVEL")
      }
    })
  })

  describe("CreateGameBodySchema", () => {
    it("parses valid body and trims name", () => {
      const result = CreateGameBodySchema.safeParse({ name: "  Pub Quiz  " })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: "Pub Quiz" })
      }
    })

    it("fails with INVALID_GAME_NAME when name is missing or invalid", () => {
      const result = CreateGameBodySchema.safeParse({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_GAME_NAME")
      }
    })
  })

  describe("UpdateGameBodySchema", () => {
    it("accepts level alone, name alone, or both together", () => {
      expect(UpdateGameBodySchema.parse({ level: 3 })).toEqual({ level: 3 })
      expect(UpdateGameBodySchema.parse({ name: "  Finals  " })).toEqual({
        name: "Finals",
      })
      expect(
        UpdateGameBodySchema.parse({ level: 5, name: "Championship" })
      ).toEqual({
        level: 5,
        name: "Championship",
      })
    })

    it("rejects an empty object with INVALID_LEVEL", () => {
      const result = UpdateGameBodySchema.safeParse({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_LEVEL")
      }
    })

    it("rejects invalid field values with their respective error codes", () => {
      const badLevel = UpdateGameBodySchema.safeParse({ level: 9 })
      expect(badLevel.success).toBe(false)
      if (!badLevel.success) {
        expect(badLevel.error.issues[0]?.message).toBe("INVALID_LEVEL")
      }

      const badName = UpdateGameBodySchema.safeParse({ name: "" })
      expect(badName.success).toBe(false)
      if (!badName.success) {
        expect(badName.error.issues[0]?.message).toBe("INVALID_GAME_NAME")
      }
    })
  })

  describe("GameParamsSchema", () => {
    it("validates gameId param", () => {
      expect(GameParamsSchema.parse({ gameId: VALID_GAME_ID })).toEqual({
        gameId: VALID_GAME_ID,
      })

      const invalid = GameParamsSchema.safeParse({ gameId: "bad-id" })
      expect(invalid.success).toBe(false)
      if (!invalid.success) {
        expect(invalid.error.issues[0]?.message).toBe("INVALID_GAME_ID")
      }
    })
  })

  describe("GameHashSchema", () => {
    it("coerces stringified Redis hash fields into typed values", () => {
      const parsed = GameHashSchema.parse({
        level: "2",
        created_at: "2026-11-12T21:50:00.123Z",
        name: "Friday Trivia",
      })

      expect(parsed).toEqual({
        level: 2,
        created_at: "2026-11-12T21:50:00.123Z",
        name: "Friday Trivia",
      })
    })

    it("rejects out-of-range coerced levels or empty hash data", () => {
      expect(
        GameHashSchema.safeParse({
          level: "7",
          created_at: "2026-11-12T21:50:00.123Z",
          name: "Friday Trivia",
        }).success
      ).toBe(false)

      expect(GameHashSchema.safeParse({}).success).toBe(false)
    })
  })
})
