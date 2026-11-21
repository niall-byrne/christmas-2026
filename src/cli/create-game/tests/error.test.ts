import { beforeEach, describe, expect, it } from "vitest"
import { CreateGameResponseError } from "@/cli/create-game/error"

describe("CreateGameResponseError", () => {
  const TEST_FIXTURES = {
    missingIdMessage: "The API response did not contain a game ID",
    invalidIdMessage: "The API response contained an invalid game ID",
  }

  describe("when the response is missing a game ID", () => {
    let error: CreateGameResponseError

    beforeEach(() => {
      error = CreateGameResponseError.missingGameId()
    })

    it("creates a response error with the missing-ID message", () => {
      expect(error).toBeInstanceOf(CreateGameResponseError)
      expect(error.name).toBe("CreateGameResponseError")
      expect(error.message).toBe(TEST_FIXTURES.missingIdMessage)
    })
  })

  describe("when the response contains an invalid game ID", () => {
    let error: CreateGameResponseError

    beforeEach(() => {
      error = CreateGameResponseError.invalidGameId()
    })

    it("creates a response error with the invalid-ID message", () => {
      expect(error).toBeInstanceOf(CreateGameResponseError)
      expect(error.name).toBe("CreateGameResponseError")
      expect(error.message).toBe(TEST_FIXTURES.invalidIdMessage)
    })
  })
})
