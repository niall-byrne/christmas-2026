import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import {
  captureResponse,
  createApiContext,
  sendRequest,
} from "@/e2e/resources/api"
import { captureGameMutation, createGameSession } from "@/e2e/resources/games"
import { addPlayer } from "@/e2e/resources/players"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { createTeam } from "@/e2e/resources/teams"

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
        expect(scenario.body).toMatchObject({ error: "UNAUTHORIZED" })
      })
    })

    test.describe("requests with a valid game session", () => {
      let session: APIRequestContext | undefined
      let scenario: {
        gameId: string
        teamId: string
        responseStatus: number
        responseBody: { playerId: string; name: string; ready: boolean }
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        const { gameId } = fixture
        const activeSession = fixture.session
        session = activeSession
        const { teamId } = await createTeam(activeSession, gameId)
        const response = await activeSession.post(
          `/api/v1/games/${gameId}/teams/${teamId}/players`,
          { data: TEST_FIXTURES.player }
        )
        scenario = {
          gameId,
          teamId,
          ...(await captureGameMutation(activeSession, gameId, response)),
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("returns the added player and persists it", async () => {
        await test.step("API response", () => {
          expect(scenario.responseStatus).toBe(201)
          expect(scenario.responseBody).toMatchObject({
            name: TEST_FIXTURES.player.name,
            ready: false,
          })
        })

        await test.step("Redis game state", () => {
          expect(scenario.gameState).toMatchObject({
            gameId: scenario.gameId,
            teams: [
              expect.objectContaining({
                teamId: scenario.teamId,
                players: [
                  expect.objectContaining({
                    playerId: scenario.responseBody.playerId,
                    name: TEST_FIXTURES.player.name,
                    ready: false,
                  }),
                ],
              }),
            ],
          })
        })
      })
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
        expect(scenario.body).toMatchObject({ error: "UNAUTHORIZED" })
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
        expect(scenario.body).toMatchObject({ error: "UNAUTHORIZED" })
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
        expect(scenario.body).toMatchObject({ error: "UNAUTHORIZED" })
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
    })
  })
})
