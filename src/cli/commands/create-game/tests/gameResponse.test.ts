import { beforeEach, describe, expect, it } from "vitest"
import { parseCreatedGameId } from "@/cli/commands/create-game/gameResponse"

describe("parseCreatedGameId", () => {
  const TEST_FIXTURES = {
    gameId: "a1b2c3d4e5f6g7h8i9j0k1l2",
    customField: "createdId",
  }

  describe("when the payload contains a valid game ID", () => {
    describe("when using the default response field", () => {
      let gameId: string

      beforeEach(() => {
        gameId = parseCreatedGameId({ gameId: TEST_FIXTURES.gameId })
      })

      it("returns the game ID", () => {
        expect(gameId).toBe(TEST_FIXTURES.gameId)
      })
    })

    describe("when using a configured response field", () => {
      let gameId: string

      beforeEach(() => {
        gameId = parseCreatedGameId(
          { [TEST_FIXTURES.customField]: TEST_FIXTURES.gameId },
          TEST_FIXTURES.customField
        )
      })

      it("returns the game ID from the configured field", () => {
        expect(gameId).toBe(TEST_FIXTURES.gameId)
      })
    })
  })

  describe("when the payload does not contain a string game ID", () => {
    describe.each([
      { description: "null", payload: null },
      {
        description: "the game ID field",
        payload: { id: TEST_FIXTURES.gameId },
      },
      { description: "a string game ID", payload: { gameId: 123 } },
    ])("when the payload is $description", ({ payload }) => {
      let error: unknown

      beforeEach(() => {
        try {
          parseCreatedGameId(payload)
        } catch (caught) {
          error = caught
        }
      })

      it("reports that the response did not contain a game ID", () => {
        expect(error).toMatchObject({
          message: "The API response did not contain a game ID",
        })
      })
    })
  })

  describe("when the payload contains a malformed game ID", () => {
    let error: unknown

    beforeEach(() => {
      try {
        parseCreatedGameId({ gameId: "invalid" })
      } catch (caught) {
        error = caught
      }
    })

    it("reports that the response contained an invalid game ID", () => {
      expect(error).toMatchObject({
        message: "The API response contained an invalid game ID",
      })
    })
  })
})
