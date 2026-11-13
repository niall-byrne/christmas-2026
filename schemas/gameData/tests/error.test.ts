import { describe, expect, it } from "vitest"
import { ERROR_MESSAGE_MAP } from "@/schemas/gameData/error"
import type { ApiErrorCode } from "@/contracts/gameData"

describe("ERROR_MESSAGE_MAP", () => {
  const EXPECTED_ENTRIES: Array<[ApiErrorCode, string]> = [
    ["INVALID_JSON", "Invalid JSON body"],
    ["INVALID_GAME_ID", "Invalid game ID"],
    ["INVALID_TEAM_ID", "Invalid team ID"],
    ["INVALID_PLAYER_ID", "Invalid player ID"],
    ["INVALID_GAME_NAME", "Invalid name"],
    ["INVALID_GAME_PASSWORD", "Invalid password"],
    ["INVALID_BONUS_CARD", "Invalid bonus card"],
    ["INVALID_GAME_CARDS", "Invalid cards"],
    ["INVALID_LEVEL", "Invalid level"],
    ["INVALID_TEAM_NAME", "Invalid name"],
    ["INVALID_TEAM_COLOUR", "Invalid colour"],
    ["INVALID_SCORE_DELTA", "Invalid delta"],
    ["INVALID_PLAYER_NAME", "Invalid name"],
    ["INCORRECT_GAME_PASSWORD", "Incorrect game password"],
    ["UNAUTHORIZED", "Authentication required"],
    ["GAME_NOT_FOUND", "Game not found"],
    ["TEAM_NOT_FOUND", "Team not found"],
    ["PLAYER_NOT_FOUND", "Player not found"],
    ["TEAM_NAME_NOT_AVAILABLE", "Team name not available"],
    ["TEAM_COLOUR_NOT_AVAILABLE", "Team colour not available"],
    ["NAME_NOT_AVAILABLE", "Name not available"],
    ["RECIPIENT_NOT_FOUND", "Player not on recipient list"],
    ["TEAM_FULL", "Team already full"],
    ["INTERNAL_SERVER_ERROR", "Internal server error"],
  ]

  it("contains all expected error codes and exact human-readable messages", () => {
    expect(ERROR_MESSAGE_MAP.size).toBe(EXPECTED_ENTRIES.length)

    for (const [code, message] of EXPECTED_ENTRIES) {
      expect(ERROR_MESSAGE_MAP.get(code)).toBe(message)
    }
  })
})
