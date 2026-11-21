import { beforeEach, describe, expect, it } from "vitest"
import { CliBaseError } from "@/lib/cli/error/bases/cliBaseError"
import { CreateJoinUrlStep } from "@/lib/cli/step/createJoinUrlStep"

describe("CreateJoinUrlStep", () => {
  const TEST_FIXTURES = {
    context: {
      origin: "https://games.test",
      gameId: "game / one",
      gameData: { password: "secret & safe" },
    },
    options: {
      originKey: "origin",
      gameIdKey: "gameId",
      gameDataKey: "gameData",
      outputKey: "joinUrl",
      path: "/play/game/",
      passwordField: "password",
      passwordQueryParameter: "password",
    },
  }

  describe("when a password-protected game context is provided", () => {
    let result: Record<string, unknown>

    beforeEach(async () => {
      const step = new CreateJoinUrlStep(TEST_FIXTURES.options)
      result = await step.run(TEST_FIXTURES.context)
    })

    it("returns an encoded game identifier and password in the join URL", () => {
      const expectedUrl = new URL(
        "https://games.test/play/game/game%20%2F%20one"
      )
      expectedUrl.searchParams.set("password", "secret & safe")

      expect(result).toEqual({ joinUrl: expectedUrl })
    })
  })

  describe("when the game identifier is missing", () => {
    let error: unknown

    beforeEach(async () => {
      const step = new CreateJoinUrlStep(TEST_FIXTURES.options)
      try {
        await step.run({ ...TEST_FIXTURES.context, gameId: undefined })
      } catch (caught) {
        error = caught
      }
    })

    it("rejects with a CLI error", () => {
      expect(error).toBeInstanceOf(CliBaseError)
    })
  })
})
