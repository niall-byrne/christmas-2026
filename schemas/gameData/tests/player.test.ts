import { describe, expect, it } from "vitest"
import {
  PlayerNameSchema,
  AddPlayerBodySchema,
  PlayerParamsSchema,
  PlayerHashSchema,
} from "@/schemas/gameData/player"

const VALID_GAME_ID = "a1b2c3d4e5f6g7h8i9j0k1l2"
const VALID_TEAM_ID = "z9y8x7w6v5u4t3s2r1q0p9o8"
const VALID_PLAYER_ID = "m1n2b3v4c5x6z7l8k9j0h1g2"

describe("player schemas", () => {
  describe("PlayerNameSchema", () => {
    it("accepts valid player names and trims whitespace", () => {
      expect(PlayerNameSchema.parse("  Alice  ")).toBe("Alice")
      expect(PlayerNameSchema.parse("p".repeat(80))).toBe("p".repeat(80))
    })

    it.each([
      ["empty string", ""],
      ["whitespace only", "   "],
      ["exceeding 80 chars", "p".repeat(81)],
      ["non-string", 101],
      ["undefined", undefined],
    ])("rejects %s with INVALID_PLAYER_NAME", (_label, input) => {
      const result = PlayerNameSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_PLAYER_NAME")
      }
    })
  })

  describe("AddPlayerBodySchema", () => {
    it("parses and trims player name", () => {
      expect(AddPlayerBodySchema.parse({ name: "  Bob  " })).toEqual({
        name: "Bob",
      })
    })
  })

  describe("PlayerParamsSchema", () => {
    it("validates gameId, teamId, and playerId together", () => {
      expect(
        PlayerParamsSchema.parse({
          gameId: VALID_GAME_ID,
          teamId: VALID_TEAM_ID,
          playerId: VALID_PLAYER_ID,
        })
      ).toEqual({
        gameId: VALID_GAME_ID,
        teamId: VALID_TEAM_ID,
        playerId: VALID_PLAYER_ID,
      })

      const invalidPlayer = PlayerParamsSchema.safeParse({
        gameId: VALID_GAME_ID,
        teamId: VALID_TEAM_ID,
        playerId: "short",
      })
      expect(invalidPlayer.success).toBe(false)
      if (!invalidPlayer.success) {
        expect(invalidPlayer.error.issues[0]?.message).toBe("INVALID_PLAYER_ID")
      }
    })
  })

  describe("PlayerHashSchema", () => {
    it("parses valid Redis player hash", () => {
      expect(PlayerHashSchema.parse({ name: "Alice" })).toEqual({
        name: "Alice",
      })
    })

    it("rejects empty hash or oversized name", () => {
      expect(PlayerHashSchema.safeParse({}).success).toBe(false)
      expect(PlayerHashSchema.safeParse({ name: "" }).success).toBe(false)
      expect(PlayerHashSchema.safeParse({ name: "a".repeat(81) }).success).toBe(
        false
      )
    })
  })
})
