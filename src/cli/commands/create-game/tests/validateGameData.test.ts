import { beforeEach, describe, expect, it } from "vitest"
import type { CreateGameRequest } from "@/contracts/game/api/data"
import { validateCreateGameData } from "@/cli/commands/create-game/validateGameData"
import { CliBaseError } from "@/cli/lib/error/bases/cliBaseError"

describe("validateCreateGameData", () => {
  const TEST_FIXTURES = {
    validGame: {
      name: "Christmas Card Showdown",
      password: "rudolph & friends",
      bonusCard: "Gold Crown",
      cards: [
        { recipient: "Alice", identifier: "Gold Star" },
        { recipient: "Bob", identifier: "Pine Tree" },
      ],
    } satisfies CreateGameRequest,
  }

  describe("when game data matches the create-game schema", () => {
    let parsedData: CreateGameRequest

    beforeEach(() => {
      parsedData = validateCreateGameData(TEST_FIXTURES.validGame)
    })

    it("returns the validated game data", () => {
      expect(parsedData).toEqual(TEST_FIXTURES.validGame)
    })
  })

  describe("when game data contains an invalid card list", () => {
    let error: unknown

    beforeEach(() => {
      try {
        validateCreateGameData({
          ...TEST_FIXTURES.validGame,
          cards: [],
        })
      } catch (caught) {
        error = caught
      }
    })

    it("reports the card validation issue", () => {
      expect(error).toMatchObject({
        message: expect.stringContaining("cards: Invalid cards"),
      })
    })
  })

  describe("when the input is not an object", () => {
    let error: unknown

    beforeEach(() => {
      try {
        validateCreateGameData(null)
      } catch (caught) {
        error = caught
      }
    })

    it("rejects the value with a CLI validation error", () => {
      expect(error).toBeInstanceOf(CliBaseError)
    })
  })
})
