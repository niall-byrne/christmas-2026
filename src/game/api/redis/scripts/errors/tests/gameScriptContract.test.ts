import { describe, expect, it } from "vitest"
import { GAME_SCRIPT_CONTRACT_ERROR } from "@/contracts/game/api/data/gameScript"
import { GameScriptContractError } from "@/game/api/redis/scripts/errors/gameScriptContract"

describe("GameScriptContractError", () => {
  const TEST_FIXTURES = {
    code: GAME_SCRIPT_CONTRACT_ERROR.CREATE_GAME_RESULT,
    message: "Create-game script returned an invalid success result",
  } as const

  it("provides a named error with its centralized reason and message", () => {
    const error = new GameScriptContractError(TEST_FIXTURES.code)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("GameScriptContractError")
    expect(error.code).toBe(TEST_FIXTURES.code)
    expect(error.message).toBe(TEST_FIXTURES.message)
  })
})
