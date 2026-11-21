import { beforeEach, describe, expect, it } from "vitest"
import { gameIds } from "@/lib/game/ids"

describe("game IDs", () => {
  const TEST_FIXTURES = {
    expectedIdPattern: /^[a-f0-9]{24}$/,
  }

  describe("when createGameId is called", () => {
    let gameId: string

    beforeEach(() => {
      gameId = gameIds.createGameId()
    })

    it("returns a 24-character lowercase hexadecimal ID", () => {
      expect(gameId).toMatch(TEST_FIXTURES.expectedIdPattern)
    })
  })

  describe("when createEntityId is called", () => {
    let entityId: string

    beforeEach(() => {
      entityId = gameIds.createEntityId()
    })

    it("returns a 24-character lowercase hexadecimal ID", () => {
      expect(entityId).toMatch(TEST_FIXTURES.expectedIdPattern)
    })
  })
})
