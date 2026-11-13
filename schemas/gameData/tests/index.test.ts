import { describe, expect, it } from "vitest"
import * as GameDataSchemas from "@/schemas/gameData"

describe("schemas/gameData barrel export", () => {
  it("re-exports all schemas, constants, and error mappings", () => {
    expect(GameDataSchemas.ID_REGEX).toBeDefined()
    expect(GameDataSchemas.GameIdSchema).toBeDefined()
    expect(GameDataSchemas.TeamIdSchema).toBeDefined()
    expect(GameDataSchemas.PlayerIdSchema).toBeDefined()

    expect(GameDataSchemas.ERROR_MESSAGE_MAP).toBeInstanceOf(Map)

    expect(GameDataSchemas.GameNameSchema).toBeDefined()
    expect(GameDataSchemas.GameLevelSchema).toBeDefined()
    expect(GameDataSchemas.CreateGameBodySchema).toBeDefined()
    expect(GameDataSchemas.UpdateGameBodySchema).toBeDefined()
    expect(GameDataSchemas.GameParamsSchema).toBeDefined()
    expect(GameDataSchemas.GameHashSchema).toBeDefined()

    expect(GameDataSchemas.TeamNameSchema).toBeDefined()
    expect(GameDataSchemas.TeamColorSchema).toBeDefined()
    expect(GameDataSchemas.ScoreDeltaSchema).toBeDefined()
    expect(GameDataSchemas.CreateTeamBodySchema).toBeDefined()
    expect(GameDataSchemas.UpdateTeamScoreBodySchema).toBeDefined()
    expect(GameDataSchemas.TeamParamsSchema).toBeDefined()
    expect(GameDataSchemas.TeamHashSchema).toBeDefined()

    expect(GameDataSchemas.PlayerNameSchema).toBeDefined()
    expect(GameDataSchemas.AddPlayerBodySchema).toBeDefined()
    expect(GameDataSchemas.PlayerParamsSchema).toBeDefined()
    expect(GameDataSchemas.PlayerHashSchema).toBeDefined()
  })
})
