import { describe, expect, it } from "vitest"
import * as GameDataSchemas from "@/schemas/gameData"

describe("schemas/gameData barrel export", () => {
  describe("common identifiers and constants", () => {
    it("re-exports ID regex and core ID schemas", () => {
      expect(GameDataSchemas.ID_REGEX).toBeDefined()
      expect(GameDataSchemas.GameIdSchema).toBeDefined()
      expect(GameDataSchemas.TeamIdSchema).toBeDefined()
      expect(GameDataSchemas.PlayerIdSchema).toBeDefined()
    })
  })

  describe("error handling", () => {
    it("re-exports the error message map", () => {
      expect(GameDataSchemas.ERROR_MESSAGE_MAP).toBeInstanceOf(Map)
    })
  })

  describe("card schemas", () => {
    it("re-exports card-related schemas and constants", () => {
      expect(GameDataSchemas.BonusCardSchema).toBeDefined()
      expect(GameDataSchemas.CardStateSchema).toBeDefined()
      expect(GameDataSchemas.GameCardsSchema).toBeDefined()
      expect(GameDataSchemas.GameCardsHashSchema).toBeDefined()
    })
  })

  describe("game schemas", () => {
    it("re-exports game-level schemas, bodies, and parameter validators", () => {
      expect(GameDataSchemas.GameNameSchema).toBeDefined()
      expect(GameDataSchemas.GameLevelSchema).toBeDefined()
      expect(GameDataSchemas.GamePasswordSchema).toBeDefined()
      expect(GameDataSchemas.CreateGameBodySchema).toBeDefined()
      expect(GameDataSchemas.JoinGameBodySchema).toBeDefined()
      expect(GameDataSchemas.UpdateGameBodySchema).toBeDefined()
      expect(GameDataSchemas.GameParamsSchema).toBeDefined()
      expect(GameDataSchemas.GameHashSchema).toBeDefined()
    })
  })

  describe("team schemas", () => {
    it("re-exports team-level schemas, bodies, and hash parsers", () => {
      expect(GameDataSchemas.TeamNameSchema).toBeDefined()
      expect(GameDataSchemas.TeamColorSchema).toBeDefined()
      expect(GameDataSchemas.ScoreDeltaSchema).toBeDefined()
      expect(GameDataSchemas.CreateTeamBodySchema).toBeDefined()
      expect(GameDataSchemas.UpdateTeamScoreBodySchema).toBeDefined()
      expect(GameDataSchemas.TeamParamsSchema).toBeDefined()
      expect(GameDataSchemas.TeamHashSchema).toBeDefined()
    })
  })

  describe("player schemas", () => {
    it("re-exports player-level schemas, bodies, and parameter validators", () => {
      expect(GameDataSchemas.PlayerNameSchema).toBeDefined()
      expect(GameDataSchemas.AddPlayerBodySchema).toBeDefined()
      expect(GameDataSchemas.PlayerParamsSchema).toBeDefined()
      expect(GameDataSchemas.PlayerHashSchema).toBeDefined()
    })
  })
})
