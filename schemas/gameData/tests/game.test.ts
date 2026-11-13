import { describe, expect, it } from "vitest"
import {
  GAME_COMPLETE_LEVEL,
  GAME_LOBBY_LEVEL,
} from "@/contracts/gameData/game"
import {
  GameNameSchema,
  GameLevelSchema,
  GamePasswordSchema,
  CreateGameBodySchema,
  JoinGameBodySchema,
  UpdateGameBodySchema,
  GameParamsSchema,
  GameHashSchema,
  GetGameResponseSchema,
} from "@/schemas/gameData/game"

const VALID_GAME_ID = "a1b2c3d4e5f6g7h8i9j0k1l2"
const VALID_TEAM_ID = "z9y8x7w6v5u4t3s2r1q0p9o8"
const VALID_PLAYER_ID = "m1n2b3v4c5x6z7l8k9j0h1g2"
const VALID_CARDS = [
  { recipient: "Alice", identifier: "Gold Star" },
  { recipient: "Bob", identifier: "Pine Tree" },
]

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

  describe("GamePasswordSchema", () => {
    it("accepts valid passwords and trims surrounding whitespace", () => {
      expect(GamePasswordSchema.parse("  santa  ")).toBe("santa")
      expect(GamePasswordSchema.parse("p")).toBe("p")
      expect(GamePasswordSchema.parse("p".repeat(128))).toBe("p".repeat(128))
    })

    it.each([
      ["empty string", ""],
      ["whitespace-only string", "   \t\n  "],
      ["password exceeding 128 chars", "p".repeat(129)],
      ["non-string input", 1234],
      ["undefined", undefined],
    ])("rejects %s with INVALID_GAME_PASSWORD", (_label, input) => {
      const result = GamePasswordSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_GAME_PASSWORD")
      }
    })
  })

  describe("CreateGameBodySchema", () => {
    it("parses valid body and trims fields", () => {
      const result = CreateGameBodySchema.safeParse({
        name: "  Pub Quiz  ",
        password: "  rudolph  ",
        bonusCard: "  Gold Crown  ",
        cards: VALID_CARDS,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({
          name: "Pub Quiz",
          password: "rudolph",
          bonusCard: "Gold Crown",
          cards: VALID_CARDS,
        })
      }
    })

    it("fails with INVALID_GAME_NAME when name is missing", () => {
      const result = CreateGameBodySchema.safeParse({
        password: "santa",
        bonusCard: "Gold Crown",
        cards: VALID_CARDS,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_GAME_NAME")
      }
    })

    it("fails with INVALID_GAME_PASSWORD when password is missing", () => {
      const result = CreateGameBodySchema.safeParse({
        name: "Pub Quiz",
        bonusCard: "Gold Crown",
        cards: VALID_CARDS,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_GAME_PASSWORD")
      }
    })

    it("fails with INVALID_BONUS_CARD when bonusCard is missing", () => {
      const result = CreateGameBodySchema.safeParse({
        name: "Pub Quiz",
        password: "santa",
        cards: VALID_CARDS,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_BONUS_CARD")
      }
    })

    it("fails with INVALID_GAME_CARDS when cards is missing", () => {
      const result = CreateGameBodySchema.safeParse({
        name: "Pub Quiz",
        password: "santa",
        bonusCard: "Gold Crown",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_GAME_CARDS")
      }
    })
  })
  describe("JoinGameBodySchema", () => {
    it("parses valid password and trims whitespace", () => {
      const result = JoinGameBodySchema.safeParse({ password: "  santa  " })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ password: "santa" })
      }
    })

    it("rejects missing or empty password with INVALID_GAME_PASSWORD", () => {
      const missing = JoinGameBodySchema.safeParse({})
      expect(missing.success).toBe(false)
      if (!missing.success) {
        expect(missing.error.issues[0]?.message).toBe("INVALID_GAME_PASSWORD")
      }

      const blank = JoinGameBodySchema.safeParse({ password: "   " })
      expect(blank.success).toBe(false)
      if (!blank.success) {
        expect(blank.error.issues[0]?.message).toBe("INVALID_GAME_PASSWORD")
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
    it("coerces stringified Redis hash fields including password_hash and bonus_card", () => {
      const parsed = GameHashSchema.parse({
        level: "2",
        created_at: "2026-11-12T21:50:00.123Z",
        name: "Friday Trivia",
        password_hash: "0123456789abcdef:fedcba9876543210",
        bonus_card: "Gold Crown",
      })

      expect(parsed).toEqual({
        level: 2,
        created_at: "2026-11-12T21:50:00.123Z",
        name: "Friday Trivia",
        password_hash: "0123456789abcdef:fedcba9876543210",
        bonus_card: "Gold Crown",
      })
    })

    it("rejects missing bonus_card, missing password_hash, out-of-range levels, or empty hash data", () => {
      expect(
        GameHashSchema.safeParse({
          level: "2",
          created_at: "2026-11-12T21:50:00.123Z",
          name: "Friday Trivia",
          password_hash: "salt:hash",
        }).success
      ).toBe(false)

      expect(
        GameHashSchema.safeParse({
          level: "2",
          created_at: "2026-11-12T21:50:00.123Z",
          name: "Friday Trivia",
          bonus_card: "Gold Crown",
        }).success
      ).toBe(false)

      expect(
        GameHashSchema.safeParse({
          level: "7",
          created_at: "2026-11-12T21:50:00.123Z",
          name: "Friday Trivia",
          password_hash: "salt:hash",
          bonus_card: "Gold Crown",
        }).success
      ).toBe(false)

      expect(GameHashSchema.safeParse({}).success).toBe(false)
    })
  })

  describe("GetGameResponseSchema", () => {
    const basePayload = {
      gameId: VALID_GAME_ID,
      name: "Friday Trivia",
      createdAt: "2026-11-12T21:50:00.123Z",
      recipients: ["Alice", "Bob"],
      teams: [
        {
          teamId: VALID_TEAM_ID,
          name: "Red Pandas",
          color: "#ef4444",
          score: 10,
          players: [{ playerId: VALID_PLAYER_ID, name: "Alice", ready: false }],
        },
      ],
    }

    it("accepts active game snapshots (level < GAME_COMPLETE_LEVEL) without cards or bonusCard", () => {
      const parsed = GetGameResponseSchema.parse({
        ...basePayload,
        level: GAME_LOBBY_LEVEL,
      })

      expect(parsed).toEqual({
        ...basePayload,
        level: GAME_LOBBY_LEVEL,
      })
    })

    it("accepts completed game snapshots at GAME_COMPLETE_LEVEL with bonusCard and cards", () => {
      const completed = {
        ...basePayload,
        level: GAME_COMPLETE_LEVEL,
        bonusCard: "Gold Crown",
        cards: VALID_CARDS,
      }

      expect(GetGameResponseSchema.parse(completed)).toEqual(completed)
    })

    it("rejects completed level snapshots missing bonusCard or cards, and rejects out-of-range levels", () => {
      expect(
        GetGameResponseSchema.safeParse({
          ...basePayload,
          level: GAME_COMPLETE_LEVEL,
        }).success
      ).toBe(false)

      expect(
        GetGameResponseSchema.safeParse({
          ...basePayload,
          level: -1,
        }).success
      ).toBe(false)

      expect(
        GetGameResponseSchema.safeParse({
          ...basePayload,
          level: GAME_COMPLETE_LEVEL + 1,
        }).success
      ).toBe(false)
    })
  })
})
