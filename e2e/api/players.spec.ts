import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import { ApiErrorCode } from "@/contracts/gameData"
import {
  captureResponse,
  createApiContext,
  sendRequest,
} from "@/e2e/resources/api"
import {
  captureGameMutation,
  createGameSession,
  readGame,
} from "@/e2e/resources/games"
import { addPlayer } from "@/e2e/resources/players"
import { deleteGameRecord } from "@/e2e/resources/redis"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { createTeam } from "@/e2e/resources/teams"

const MISSING_ENTITY_ID = "000000000000000000000000"

test.describe("Player endpoints", () => {
  test.describe("POST /api/v1/games/:gameId/teams/:teamId/players", () => {
    test.describe("requests without a valid game session", () => {
      let session: APIRequestContext | undefined
      let unauthenticated: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const { teamId } = await createTeam(session, fixture.gameId)
        unauthenticated = await createApiContext(playwright)
        scenario = await captureResponse(
          await sendRequest(
            unauthenticated,
            `/api/v1/games/${fixture.gameId}/teams/${teamId}/players`,
            "post",
            TEST_FIXTURES.player
          )
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
        await unauthenticated?.dispose()
      })

      test("returns 401", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("authenticated requests", () => {
      test.describe("successful requests", () => {
        let session: APIRequestContext | undefined
        let gameId: string
        let teamId: string

        test.beforeEach(async ({ playwright }) => {
          const fixture = await createGameSession(playwright)
          session = fixture.session
          gameId = fixture.gameId
          const team = await createTeam(session, gameId)
          teamId = team.teamId
        })

        test.afterEach(async () => {
          await session?.dispose()
        })

        test("adds the player and persists it", async () => {
          const activeSession = session
          if (!activeSession) {
            throw new Error("Game session was not initialized")
          }

          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${teamId}/players`,
            { data: TEST_FIXTURES.player }
          )
          expect(response.status()).toBe(201)
          const player = await response.json()
          expect(player).toMatchObject({
            name: TEST_FIXTURES.player.name,
            ready: false,
          })
          expect(await readGame(activeSession, gameId)).toMatchObject({
            gameId,
            teams: [
              {
                teamId,
                players: [
                  {
                    playerId: player.playerId,
                    name: TEST_FIXTURES.player.name,
                    ready: false,
                  },
                ],
              },
            ],
          })
        })
      })

      test.describe("rejected requests", () => {
        let session: APIRequestContext | undefined
        let gameId: string
        let teamId: string

        test.beforeEach(async ({ playwright }) => {
          const fixture = await createGameSession(playwright, {
            ...TEST_FIXTURES.game,
            cards: [
              ...TEST_FIXTURES.game.cards,
              { recipient: "Cara", identifier: "card-cara" },
            ],
          })
          session = fixture.session
          gameId = fixture.gameId
          const team = await createTeam(session, gameId)
          teamId = team.teamId
          await addPlayer(session, gameId, teamId)
          await addPlayer(session, gameId, teamId, "Bob")
        })

        test.afterEach(async () => {
          await session?.dispose()
        })

        test("rejects an unknown recipient", async () => {
          const activeSession = session
          if (!activeSession) {
            throw new Error("Game session was not initialized")
          }

          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${teamId}/players`,
            { data: { name: "Unknown" } }
          )
          expect(response.status()).toBe(422)
          expect(await response.json()).toMatchObject({
            error: ApiErrorCode.RECIPIENT_NOT_FOUND,
          })
        })

        test("rejects a name already assigned to a player", async () => {
          const activeSession = session
          if (!activeSession) {
            throw new Error("Game session was not initialized")
          }

          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${teamId}/players`,
            { data: TEST_FIXTURES.player }
          )
          expect(response.status()).toBe(409)
          expect(await response.json()).toMatchObject({
            error: ApiErrorCode.NAME_NOT_AVAILABLE,
          })
        })

        test("rejects adding a player when the team is full", async () => {
          const activeSession = session
          if (!activeSession) {
            throw new Error("Game session was not initialized")
          }

          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${teamId}/players`,
            { data: { name: "Cara" } }
          )
          expect(response.status()).toBe(422)
          expect(await response.json()).toMatchObject({
            error: ApiErrorCode.TEAM_FULL,
          })
          expect(
            (await readGame(activeSession, gameId)).teams[0].players
          ).toHaveLength(2)
        })

        test("returns team not found when the team does not exist", async () => {
          const activeSession = session
          if (!activeSession) {
            throw new Error("Game session was not initialized")
          }

          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${MISSING_ENTITY_ID}/players`,
            { data: { name: "Cara" } }
          )
          expect(response.status()).toBe(404)
          expect(await response.json()).toMatchObject({
            error: ApiErrorCode.TEAM_NOT_FOUND,
          })
        })

        test("returns game not found when the game does not exist", async () => {
          const activeSession = session
          if (!activeSession) {
            throw new Error("Game session was not initialized")
          }

          await deleteGameRecord(gameId)
          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${teamId}/players`,
            { data: { name: "Cara" } }
          )
          expect(response.status()).toBe(404)
          expect(await response.json()).toMatchObject({
            error: ApiErrorCode.GAME_NOT_FOUND,
          })
        })
      })
    })
  })

  test.describe("concurrent requests for the same recipient", () => {
    let session: APIRequestContext | undefined
    let gameId: string
    let teamId: string
    let initialRevision: number

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      const activeSession = fixture.session
      session = activeSession
      gameId = fixture.gameId
      const team = await createTeam(activeSession, gameId)
      teamId = team.teamId
      initialRevision = (await readGame(activeSession, gameId)).revision
    })

    test.afterEach(async () => {
      await session?.dispose()
    })

    test("creates a player and reports the duplicate concurrent request", async () => {
      const activeSession = session
      if (!activeSession) {
        throw new Error("Game session was not initialized")
      }

      const responses = await Promise.all([
        activeSession.post(`/api/v1/games/${gameId}/teams/${teamId}/players`, {
          data: TEST_FIXTURES.player,
        }),
        activeSession.post(`/api/v1/games/${gameId}/teams/${teamId}/players`, {
          data: TEST_FIXTURES.player,
        }),
      ])
      expect(responses.map((response) => response.status()).sort()).toEqual([
        201, 409,
      ])
      const conflict = responses.find((response) => response.status() === 409)
      if (!conflict) {
        throw new Error("Expected one concurrent player request to conflict")
      }
      expect(await conflict.json()).toMatchObject({
        error: ApiErrorCode.NAME_NOT_AVAILABLE,
      })

      const state = await readGame(activeSession, gameId)
      expect(state.teams[0].players).toHaveLength(1)
      expect(state.revision).toBe(initialRevision + 1)
    })
  })

  test.describe("POST /api/v1/games/:gameId/teams/:teamId/players/:playerId/ready", () => {
    test.describe("requests without a valid game session", () => {
      let session: APIRequestContext | undefined
      let unauthenticated: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const { teamId } = await createTeam(session, fixture.gameId)
        const { playerId } = await addPlayer(session, fixture.gameId, teamId)
        unauthenticated = await createApiContext(playwright)
        scenario = await captureResponse(
          await sendRequest(
            unauthenticated,
            `/api/v1/games/${fixture.gameId}/teams/${teamId}/players/${playerId}/ready`,
            "post"
          )
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
        await unauthenticated?.dispose()
      })

      test("returns 401", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("requests with a valid game session", () => {
      let session: APIRequestContext | undefined
      let scenario: {
        gameId: string
        teamId: string
        playerId: string
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        const { gameId } = fixture
        const activeSession = fixture.session
        session = activeSession
        const { teamId } = await createTeam(activeSession, gameId)
        const { playerId } = await addPlayer(activeSession, gameId, teamId)
        const response = await activeSession.post(
          `/api/v1/games/${gameId}/teams/${teamId}/players/${playerId}/ready`
        )
        scenario = {
          gameId,
          teamId,
          playerId,
          ...(await captureGameMutation(activeSession, gameId, response)),
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("reports and persists the ready player state", async () => {
        await test.step("API response", () => {
          expect(scenario.responseStatus).toBe(200)
          expect(scenario.responseBody).toMatchObject({
            playerId: scenario.playerId,
            ready: true,
          })
        })

        await test.step("Redis game state", () => {
          expect(scenario.gameState).toMatchObject({
            gameId: scenario.gameId,
            teams: [
              {
                teamId: scenario.teamId,
                players: [{ playerId: scenario.playerId, ready: true }],
              },
            ],
          })
        })
      })

      test("returns player not found when the player does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }

        const missingPlayer = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${MISSING_ENTITY_ID}/ready`
        )
        expect(missingPlayer.status()).toBe(404)
        expect(await missingPlayer.json()).toMatchObject({
          error: ApiErrorCode.PLAYER_NOT_FOUND,
        })
      })

      test("returns team not found when the team does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        const missingTeam = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams/${MISSING_ENTITY_ID}/players/${scenario.playerId}/ready`
        )
        expect(missingTeam.status()).toBe(404)
        expect(await missingTeam.json()).toMatchObject({
          error: ApiErrorCode.TEAM_NOT_FOUND,
        })
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        await deleteGameRecord(scenario.gameId)
        const missingGame = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${scenario.playerId}/ready`
        )
        expect(missingGame.status()).toBe(404)
        expect(await missingGame.json()).toMatchObject({
          error: ApiErrorCode.GAME_NOT_FOUND,
        })
      })
    })
  })

  test.describe("DELETE /api/v1/games/:gameId/teams/:teamId/players/:playerId/ready", () => {
    test.describe("requests without a valid game session", () => {
      let session: APIRequestContext | undefined
      let unauthenticated: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const { teamId } = await createTeam(session, fixture.gameId)
        const { playerId } = await addPlayer(session, fixture.gameId, teamId)
        await session.post(
          `/api/v1/games/${fixture.gameId}/teams/${teamId}/players/${playerId}/ready`
        )
        unauthenticated = await createApiContext(playwright)
        scenario = await captureResponse(
          await sendRequest(
            unauthenticated,
            `/api/v1/games/${fixture.gameId}/teams/${teamId}/players/${playerId}/ready`,
            "delete"
          )
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
        await unauthenticated?.dispose()
      })

      test("returns 401", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("requests with a valid game session", () => {
      let session: APIRequestContext | undefined
      let scenario: {
        gameId: string
        teamId: string
        playerId: string
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        const { gameId } = fixture
        const activeSession = fixture.session
        session = activeSession
        const { teamId } = await createTeam(activeSession, gameId)
        const { playerId } = await addPlayer(activeSession, gameId, teamId)
        await activeSession.post(
          `/api/v1/games/${gameId}/teams/${teamId}/players/${playerId}/ready`
        )
        const response = await activeSession.delete(
          `/api/v1/games/${gameId}/teams/${teamId}/players/${playerId}/ready`
        )
        scenario = {
          gameId,
          teamId,
          playerId,
          ...(await captureGameMutation(activeSession, gameId, response)),
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("reports and persists the not-ready player state", async () => {
        await test.step("API response", () => {
          expect(scenario.responseStatus).toBe(200)
          expect(scenario.responseBody).toMatchObject({
            playerId: scenario.playerId,
            ready: false,
          })
        })

        await test.step("Redis game state", () => {
          expect(scenario.gameState).toMatchObject({
            gameId: scenario.gameId,
            teams: [
              {
                teamId: scenario.teamId,
                players: [{ playerId: scenario.playerId, ready: false }],
              },
            ],
          })
        })
      })
    })
  })

  test.describe("DELETE /api/v1/games/:gameId/teams/:teamId/players/:playerId", () => {
    test.describe("requests without a valid game session", () => {
      let session: APIRequestContext | undefined
      let unauthenticated: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const { teamId } = await createTeam(session, fixture.gameId)
        const { playerId } = await addPlayer(session, fixture.gameId, teamId)
        unauthenticated = await createApiContext(playwright)
        scenario = await captureResponse(
          await sendRequest(
            unauthenticated,
            `/api/v1/games/${fixture.gameId}/teams/${teamId}/players/${playerId}`,
            "delete"
          )
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
        await unauthenticated?.dispose()
      })

      test("returns 401", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("requests with a valid game session", () => {
      let session: APIRequestContext | undefined
      let scenario: {
        gameId: string
        teamId: string
        playerId: string
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        const { gameId } = fixture
        const activeSession = fixture.session
        session = activeSession
        const { teamId } = await createTeam(activeSession, gameId)
        const { playerId } = await addPlayer(activeSession, gameId, teamId)
        const response = await activeSession.delete(
          `/api/v1/games/${gameId}/teams/${teamId}/players/${playerId}`
        )
        scenario = {
          gameId,
          teamId,
          playerId,
          ...(await captureGameMutation(activeSession, gameId, response)),
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("confirms removal in the response and game state", async () => {
        await test.step("API response", () => {
          expect(scenario.responseStatus).toBe(200)
          expect(scenario.responseBody).toMatchObject({
            message: "Player removed",
          })
        })

        await test.step("Redis game state", () => {
          expect(scenario.gameState).toMatchObject({
            gameId: scenario.gameId,
            teams: [{ teamId: scenario.teamId, players: [] }],
          })
        })
      })

      test("returns player not found when the player does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }

        const missingPlayer = await activeSession.delete(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${MISSING_ENTITY_ID}`
        )
        expect(missingPlayer.status()).toBe(404)
        expect(await missingPlayer.json()).toMatchObject({
          error: ApiErrorCode.PLAYER_NOT_FOUND,
        })
      })

      test("returns team not found when the team does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        const missingTeam = await activeSession.delete(
          `/api/v1/games/${scenario.gameId}/teams/${MISSING_ENTITY_ID}/players/${scenario.playerId}`
        )
        expect(missingTeam.status()).toBe(404)
        expect(await missingTeam.json()).toMatchObject({
          error: ApiErrorCode.TEAM_NOT_FOUND,
        })
      })

      test("releases the player's name after deletion", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        const reAddedPlayer = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players`,
          { data: TEST_FIXTURES.player }
        )
        expect(reAddedPlayer.status()).toBe(201)
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        await deleteGameRecord(scenario.gameId)
        const missingGame = await activeSession.delete(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${scenario.playerId}`
        )
        expect(missingGame.status()).toBe(404)
        expect(await missingGame.json()).toMatchObject({
          error: ApiErrorCode.GAME_NOT_FOUND,
        })
      })
    })
  })
})
