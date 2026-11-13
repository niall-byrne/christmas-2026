import { describe, expect, it } from "vitest"
import {
  HEX_COLOR_REGEX,
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
  describe("HEX_COLOR_REGEX", () => {
    it("matches valid 6-digit HTML hex colours", () => {
      expect(HEX_COLOR_REGEX.test("#ef4444")).toBe(true)
      expect(HEX_COLOR_REGEX.test("#16A34A")).toBe(true)
      expect(HEX_COLOR_REGEX.test("#000000")).toBe(true)
      expect(HEX_COLOR_REGEX.test("#FFFFFF")).toBe(true)
    })

    it("rejects strings without #, wrong lengths, or non-hex characters", () => {
      expect(HEX_COLOR_REGEX.test("ef4444")).toBe(false)
      expect(HEX_COLOR_REGEX.test("#fff")).toBe(false)
      expect(HEX_COLOR_REGEX.test("#ef4444ff")).toBe(false)
      expect(HEX_COLOR_REGEX.test("#gggggg")).toBe(false)
      expect(HEX_COLOR_REGEX.test("red")).toBe(false)
    })
  })

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
    it("accepts valid 6-digit HTML hex colours, trims whitespace, and normalizes to lowercase", () => {
      expect(TeamColorSchema.parse("  #ef4444  ")).toBe("#ef4444")
      expect(TeamColorSchema.parse("#16A34A")).toBe("#16a34a")
      expect(TeamColorSchema.parse("#000000")).toBe("#000000")
      expect(TeamColorSchema.parse("#FFFFFF")).toBe("#ffffff")
    })

    it.each([
      ["empty string", ""],
      ["whitespace only", "   "],
      ["missing hash prefix", "ef4444"],
      ["3-digit shorthand hex", "#fff"],
      ["8-digit hex with alpha", "#ef4444ff"],
      ["non-hex characters", "#gggggg"],
      ["CSS colour name", "red"],
      ["non-string", null],
      ["undefined", undefined],
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
    it("validates, trims, and normalizes name and hex color", () => {
      expect(
        CreateTeamBodySchema.parse({ name: " Blue Jays ", color: " #3B82F6 " })
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
    it("coerces stringified Redis score (including negative scores) and validates hex color", () => {
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

    it("rejects invalid hex colors, non-integer score strings, or empty hash", () => {
      expect(
        TeamHashSchema.safeParse({
          name: "Red Pandas",
          color: "red",
          score: "10",
        }).success
      ).toBe(false)

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
