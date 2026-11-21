import { describe, expect, it } from "vitest"
import { ERROR_MESSAGES } from "@/schemas/game/api/error"
import { ApiErrorCode } from "@/contracts/game/api/data"

describe("ERROR_MESSAGES", () => {
  const EXPECTED_ENTRIES: Array<[ApiErrorCode, string]> = [
    [ApiErrorCode.INVALID_JSON, "Invalid JSON body"],
    [ApiErrorCode.INVALID_GAME_ID, "Invalid game ID"],
    [ApiErrorCode.INVALID_TEAM_ID, "Invalid team ID"],
    [ApiErrorCode.INVALID_PLAYER_ID, "Invalid player ID"],
    [ApiErrorCode.INVALID_GAME_NAME, "Invalid name"],
    [ApiErrorCode.INVALID_GAME_PASSWORD, "Invalid password"],
    [ApiErrorCode.INVALID_BONUS_CARD, "Invalid bonus card"],
    [ApiErrorCode.INVALID_GAME_CARDS, "Invalid cards"],
    [ApiErrorCode.INVALID_LEVEL, "Invalid level"],
    [ApiErrorCode.INVALID_TEAM_NAME, "Invalid name"],
    [ApiErrorCode.INVALID_TEAM_COLOUR, "Invalid colour"],
    [ApiErrorCode.INVALID_SCORE_DELTA, "Invalid delta"],
    [ApiErrorCode.INVALID_PLAYER_NAME, "Invalid name"],
    [ApiErrorCode.INCORRECT_GAME_PASSWORD, "Incorrect game password"],
    [ApiErrorCode.RATE_LIMITED, "Too many requests"],
    [ApiErrorCode.UNAUTHORIZED, "Authentication required"],
    [ApiErrorCode.GAME_NOT_FOUND, "Game not found"],
    [ApiErrorCode.TEAM_NOT_FOUND, "Team not found"],
    [ApiErrorCode.PLAYER_NOT_FOUND, "Player not found"],
    [ApiErrorCode.TEAM_NAME_NOT_AVAILABLE, "Team name not available"],
    [ApiErrorCode.TEAM_COLOUR_NOT_AVAILABLE, "Team colour not available"],
    [ApiErrorCode.NAME_NOT_AVAILABLE, "Name not available"],
    [ApiErrorCode.RECIPIENT_NOT_FOUND, "Player not on recipient list"],
    [ApiErrorCode.TEAM_FULL, "Team already full"],
    [ApiErrorCode.INTERNAL_SERVER_ERROR, "Internal server error"],
  ]

  it("contains all expected error codes and exact human-readable messages", () => {
    expect(Object.keys(ERROR_MESSAGES)).toHaveLength(EXPECTED_ENTRIES.length)

    for (const [code, message] of EXPECTED_ENTRIES) {
      expect(ERROR_MESSAGES[code]).toBe(message)
    }
  })
})
