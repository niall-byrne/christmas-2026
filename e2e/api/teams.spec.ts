import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import {
  captureResponse,
  createApiContext,
  sendRequest,
} from "@/e2e/resources/api"
import { captureGameMutation, createGameSession } from "@/e2e/resources/games"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { createTeam } from "@/e2e/resources/teams"

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
        expect(scenario.body).toMatchObject({ error: "UNAUTHORIZED" })
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
        expect(scenario.body).toMatchObject({ error: "UNAUTHORIZED" })
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
    })
  })
})
