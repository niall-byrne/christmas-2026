import { describe, expect, it } from "vitest"
import {
  ID_REGEX,
  GameIdSchema,
  TeamIdSchema,
  PlayerIdSchema,
} from "@/schemas/gameData/common"

const VALID_ID = "a1b2c3d4e5f6g7h8i9j0k1l2"

describe("common schemas", () => {
  describe("ID_REGEX", () => {
    it("matches a valid 24-character lowercase alphanumeric string", () => {
      expect(ID_REGEX.test(VALID_ID)).toBe(true)
      expect(ID_REGEX.test("0".repeat(24))).toBe(true)
      expect(ID_REGEX.test("z".repeat(24))).toBe(true)
    })

    it("rejects strings with invalid length, uppercase letters, or symbols", () => {
      expect(ID_REGEX.test("a".repeat(23))).toBe(false)
      expect(ID_REGEX.test("a".repeat(25))).toBe(false)
      expect(ID_REGEX.test("A1b2c3d4e5f6g7h8i9j0k1l2")).toBe(false)
      expect(ID_REGEX.test("a1b2c3d4e5f6g7h8i9j0k1l-")).toBe(false)
      expect(ID_REGEX.test("a1b2c3d4e5f6g7h8i9j0k1l ")).toBe(false)
    })
  })

  describe.each([
    {
      name: "GameIdSchema",
      schema: GameIdSchema,
      expectedError: "INVALID_GAME_ID",
    },
    {
      name: "TeamIdSchema",
      schema: TeamIdSchema,
      expectedError: "INVALID_TEAM_ID",
    },
    {
      name: "PlayerIdSchema",
      schema: PlayerIdSchema,
      expectedError: "INVALID_PLAYER_ID",
    },
  ])("$name", ({ schema, expectedError }) => {
    it("accepts a valid 24-character lowercase alphanumeric ID", () => {
      const result = schema.safeParse(VALID_ID)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(VALID_ID)
      }
    })

    it.each([
      ["empty string", ""],
      ["too short (23 chars)", "a".repeat(23)],
      ["too long (25 chars)", "a".repeat(25)],
      ["uppercase characters", "A".repeat(24)],
      ["special characters", "a".repeat(23) + "_"],
      ["non-string number", 123456789012345678901234],
      ["null", null],
      ["undefined", undefined],
    ])("rejects %s with %s", (_label, input) => {
      const result = schema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(expectedError)
      }
    })
  })
})
