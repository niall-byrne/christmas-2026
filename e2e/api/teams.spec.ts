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
import { deleteGameRecord } from "@/e2e/resources/redis"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { createTeam } from "@/e2e/resources/teams"

const MISSING_ENTITY_ID = "000000000000000000000000"

test.describe("Team endpoints", () => {
  test.describe("POST /api/v1/games/:gameId/teams", () => {
    test.describe("requests without a valid game session", () => {
      let session: APIRequestContext | undefined
      let unauthenticated: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        unauthenticated = await createApiContext(playwright)
        scenario = await captureResponse(
          await sendRequest(
            unauthenticated,
            `/api/v1/games/${fixture.gameId}/teams`,
            "post",
            TEST_FIXTURES.team
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
        responseStatus: number
        responseBody: {
          teamId: string
          name: string
          color: string
          score: number
        }
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        const { gameId } = fixture
        const activeSession = fixture.session
        session = activeSession
        const response = await activeSession.post(
          `/api/v1/games/${gameId}/teams`,
          {
            data: TEST_FIXTURES.team,
          }
        )
        const result = await captureGameMutation(
          activeSession,
          gameId,
          response
        )
        scenario = { gameId, ...result }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("returns the created team and persists it", async () => {
        await test.step("API response", () => {
          expect(scenario.responseStatus).toBe(201)
          expect(scenario.responseBody).toMatchObject({
            name: TEST_FIXTURES.team.name,
            color: TEST_FIXTURES.team.color.toLowerCase(),
            score: 0,
          })
        })

        await test.step("Redis game state", () => {
          expect(scenario.gameState).toMatchObject({
            gameId: scenario.gameId,
            teams: [
              expect.objectContaining({
                teamId: scenario.responseBody.teamId,
                name: TEST_FIXTURES.team.name,
                color: TEST_FIXTURES.team.color.toLowerCase(),
                score: 0,
              }),
            ],
          })
        })
      })

      test("rejects a team name that is already in use", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }

        const duplicateName = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams`,
          { data: { name: TEST_FIXTURES.team.name, color: "#112233" } }
        )
        expect(duplicateName.status()).toBe(409)
        expect(await duplicateName.json()).toMatchObject({
          error: ApiErrorCode.TEAM_NAME_NOT_AVAILABLE,
        })
        expect(
          (await readGame(activeSession, scenario.gameId)).teams
        ).toHaveLength(1)
      })

      test("rejects a team color that is already in use", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        const duplicateColor = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams`,
          { data: { name: "Different team", color: TEST_FIXTURES.team.color } }
        )
        expect(duplicateColor.status()).toBe(409)
        expect(await duplicateColor.json()).toMatchObject({
          error: ApiErrorCode.TEAM_COLOUR_NOT_AVAILABLE,
        })
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        await deleteGameRecord(scenario.gameId)
        const missingGame = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams`,
          { data: { name: "Another team", color: "#112233" } }
        )
        expect(missingGame.status()).toBe(404)
        expect(await missingGame.json()).toMatchObject({
          error: ApiErrorCode.GAME_NOT_FOUND,
        })
      })

      test("allows only one concurrent creation of a team with the same name", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }

        const responses = await Promise.all([
          activeSession.post(`/api/v1/games/${scenario.gameId}/teams`, {
            data: { name: "Concurrent team", color: "#112233" },
          }),
          activeSession.post(`/api/v1/games/${scenario.gameId}/teams`, {
            data: { name: "Concurrent team", color: "#112233" },
          }),
        ])
        expect(responses.map((response) => response.status()).sort()).toEqual([
          201, 409,
        ])
        const conflict = responses.find((response) => response.status() === 409)
        if (!conflict) {
          throw new Error("Expected one concurrent team request to conflict")
        }
        expect(await conflict.json()).toMatchObject({
          error: ApiErrorCode.TEAM_NAME_NOT_AVAILABLE,
        })
        expect(
          (await readGame(activeSession, scenario.gameId)).teams
        ).toHaveLength(2)
      })
    })
  })

  test.describe("PATCH /api/v1/games/:gameId/teams/:teamId/score", () => {
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
            `/api/v1/games/${fixture.gameId}/teams/${teamId}/score`,
            "patch",
            { delta: 7 }
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
        const response = await activeSession.patch(
          `/api/v1/games/${gameId}/teams/${teamId}/score`,
          { data: { delta: 7 } }
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

      test("returns and persists the updated score", async () => {
        await test.step("API response", () => {
          expect(scenario.responseStatus).toBe(200)
          expect(scenario.responseBody).toMatchObject({
            teamId: scenario.teamId,
            score: 7,
          })
        })

        await test.step("Redis game state", () => {
          expect(scenario.gameState).toMatchObject({
            gameId: scenario.gameId,
            teams: [
              expect.objectContaining({ teamId: scenario.teamId, score: 7 }),
            ],
          })
        })
      })

      test("returns team not found when the team does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        const response = await activeSession.patch(
          `/api/v1/games/${scenario.gameId}/teams/${MISSING_ENTITY_ID}/score`,
          { data: { delta: 1 } }
        )
        expect(response.status()).toBe(404)
        expect(await response.json()).toMatchObject({
          error: ApiErrorCode.TEAM_NOT_FOUND,
        })
      })

      test("applies concurrent score changes without losing increments", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }

        const before = await readGame(activeSession, scenario.gameId)
        const deltas = [1, 2, 3, 4, 5]
        const responses = await Promise.all(
          deltas.map((delta) =>
            activeSession.patch(
              `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/score`,
              { data: { delta } }
            )
          )
        )
        expect(responses.map((response) => response.status())).toEqual(
          Array(deltas.length).fill(200)
        )

        const after = await readGame(activeSession, scenario.gameId)
        expect(after.teams[0].score).toBe(
          before.teams[0].score +
            deltas.reduce((total, delta) => total + delta, 0)
        )
        expect(after.revision).toBe(before.revision + deltas.length)
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        await deleteGameRecord(scenario.gameId)
        const response = await activeSession.patch(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/score`,
          { data: { delta: 1 } }
        )
        expect(response.status()).toBe(404)
        expect(await response.json()).toMatchObject({
          error: ApiErrorCode.GAME_NOT_FOUND,
        })
      })
    })
  })
})
