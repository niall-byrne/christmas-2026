import { describe, expect, it } from "vitest"
import {
  TeamNameSchema,
  TeamColorSchema,
  ScoreDeltaSchema,
  CreateTeamBodySchema,
  UpdateTeamScoreBodySchema,
  TeamParamsSchema,
  TeamHashSchema,
} from "@/schemas/gameData/team"

const VALID_GAME_ID = "a1b2c3d4e5f6g7h8i9j0k1l2"
const VALID_TEAM_ID = "z9y8x7w6v5u4t3s2r1q0p9o8"

describe("team schemas", () => {
  describe("TeamNameSchema", () => {
    it("accepts valid names and trims whitespace", () => {
      expect(TeamNameSchema.parse("  Red Pandas  ")).toBe("Red Pandas")
      expect(TeamNameSchema.parse("x".repeat(80))).toBe("x".repeat(80))
    })

    it.each([
      ["empty string", ""],
      ["whitespace only", "   "],
      ["exceeding 80 chars", "x".repeat(81)],
      ["non-string", 42],
    ])("rejects %s with INVALID_TEAM_NAME", (_label, input) => {
      const result = TeamNameSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_TEAM_NAME")
      }
    })
  })

  describe("TeamColorSchema", () => {
    it("accepts valid colour strings up to 32 chars and trims whitespace", () => {
      expect(TeamColorSchema.parse("  #ef4444  ")).toBe("#ef4444")
      expect(TeamColorSchema.parse("c".repeat(32))).toBe("c".repeat(32))
    })

    it.each([
      ["empty string", ""],
      ["whitespace only", "   "],
      ["exceeding 32 chars", "c".repeat(33)],
      ["non-string", null],
    ])("rejects %s with INVALID_TEAM_COLOUR", (_label, input) => {
      const result = TeamColorSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_TEAM_COLOUR")
      }
    })
  })

  describe("ScoreDeltaSchema", () => {
    it.each([0, 10, -5, 1000])("accepts integer delta %i", (delta) => {
      expect(ScoreDeltaSchema.parse(delta)).toBe(delta)
    })

    it.each([
      ["float", 1.5],
      ["numeric string", "10"],
      ["NaN", Number.NaN],
      ["undefined", undefined],
    ])("rejects %s with INVALID_SCORE_DELTA", (_label, input) => {
      const result = ScoreDeltaSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("INVALID_SCORE_DELTA")
      }
    })
  })

  describe("CreateTeamBodySchema", () => {
    it("validates and trims name and color", () => {
      expect(
        CreateTeamBodySchema.parse({ name: " Blue Jays ", color: " #3b82f6 " })
      ).toEqual({
        name: "Blue Jays",
        color: "#3b82f6",
      })
    })
  })

  describe("UpdateTeamScoreBodySchema", () => {
    it("validates score delta payload", () => {
      expect(UpdateTeamScoreBodySchema.parse({ delta: -10 })).toEqual({
        delta: -10,
      })
    })
  })

  describe("TeamParamsSchema", () => {
    it("validates gameId and teamId together", () => {
      expect(
        TeamParamsSchema.parse({
          gameId: VALID_GAME_ID,
          teamId: VALID_TEAM_ID,
        })
      ).toEqual({
        gameId: VALID_GAME_ID,
        teamId: VALID_TEAM_ID,
      })

      const invalidTeam = TeamParamsSchema.safeParse({
        gameId: VALID_GAME_ID,
        teamId: "invalid",
      })
      expect(invalidTeam.success).toBe(false)
      if (!invalidTeam.success) {
        expect(invalidTeam.error.issues[0]?.message).toBe("INVALID_TEAM_ID")
      }
    })
  })

  describe("TeamHashSchema", () => {
    it("coerces stringified Redis score (including negative scores) into an integer", () => {
      expect(
        TeamHashSchema.parse({
          name: "Red Pandas",
          color: "#ef4444",
          score: "-15",
        })
      ).toEqual({
        name: "Red Pandas",
        color: "#ef4444",
        score: -15,
      })
    })

    it("rejects non-integer score strings or empty hash", () => {
      expect(
        TeamHashSchema.safeParse({
          name: "Red Pandas",
          color: "#ef4444",
          score: "not-a-number",
        }).success
      ).toBe(false)

      expect(TeamHashSchema.safeParse({}).success).toBe(false)
    })
  })
})
