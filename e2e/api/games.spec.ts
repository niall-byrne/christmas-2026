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
  createGame,
  createGameSession,
  readGame,
} from "@/e2e/resources/games"
import { deleteGameRecord } from "@/e2e/resources/redis"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"

test.describe("Game endpoints", () => {
  test.describe("POST /api/v1/games", () => {
    test.describe("requests without a game session", () => {
      test.describe("valid game creation payload", () => {
        let context: APIRequestContext | undefined
        let scenario: {
          gameId: string
          responseStatus: number
          responseBody: unknown
          gameState: unknown
        }

        test.beforeEach(async ({ playwright }) => {
          context = await createApiContext(playwright)
          const response = await context.post("/api/v1/games", {
            data: TEST_FIXTURES.game,
          })
          const responseBody = await response.json()
          const gameState =
            response.status() === 201
              ? await readGame(context, responseBody.gameId)
              : undefined
          scenario = {
            gameId: responseBody.gameId,
            responseStatus: response.status(),
            responseBody,
            gameState,
          }
        })

        test.afterEach(async () => {
          await context?.dispose()
        })

        test("returns the created game and persists its state", async () => {
          await test.step("API response", () => {
            expect(scenario.responseStatus).toBe(201)
            expect(scenario.responseBody).toMatchObject({
              gameId: scenario.gameId,
              name: TEST_FIXTURES.game.name,
              level: 0,
            })
            expect(scenario.gameId).toMatch(/^[a-z0-9]{24}$/)
          })

          await test.step("Redis game state", () => {
            expect(scenario.gameState).toMatchObject({
              gameId: scenario.gameId,
              name: TEST_FIXTURES.game.name,
              level: 0,
              recipients: ["Alice", "Bob"],
            })
          })
        })
      })

      test.describe("invalid game creation payload", () => {
        let context: APIRequestContext | undefined
        let scenario: { responseStatus: number; responseBody: unknown }

        test.beforeEach(async ({ playwright }) => {
          context = await createApiContext(playwright)
          const response = await context.post("/api/v1/games", {
            data: { ...TEST_FIXTURES.game, cards: [] },
          })
          scenario = {
            responseStatus: response.status(),
            responseBody: await response.json(),
          }
        })

        test.afterEach(async () => {
          await context?.dispose()
        })

        test("rejects an empty card list", () => {
          expect(scenario.responseStatus).toBe(400)
          expect(scenario.responseBody).toMatchObject({
            error: ApiErrorCode.INVALID_GAME_CARDS,
          })
        })
      })
    })
  })

  test.describe("POST /api/v1/games/:gameId/join", () => {
    test.describe("requests without a game session", () => {
      test.describe("correct game password", () => {
        let creator: APIRequestContext | undefined
        let session: APIRequestContext | undefined
        let scenario: {
          gameId: string
          responseStatus: number
          responseBody: unknown
          authorizedReadStatus: number
        }

        test.beforeEach(async ({ playwright }) => {
          creator = await createApiContext(playwright)
          session = await createApiContext(playwright)
          const { gameId } = await createGame(creator)
          const joinResponse = await session.post(
            `/api/v1/games/${gameId}/join`,
            {
              data: { password: TEST_FIXTURES.game.password },
            }
          )
          const authorizedRead = await session.get(`/api/v1/games/${gameId}`)
          scenario = {
            gameId,
            responseStatus: joinResponse.status(),
            responseBody: await joinResponse.json(),
            authorizedReadStatus: authorizedRead.status(),
          }
        })

        test.afterEach(async () => {
          await creator?.dispose()
          await session?.dispose()
        })

        test("returns the joined game ID and authorizes game reads", async () => {
          await test.step("API response", () => {
            expect(scenario.responseStatus).toBe(200)
            expect(scenario.responseBody).toMatchObject({
              gameId: scenario.gameId,
            })
          })

          await test.step("join session cookie", () => {
            expect(scenario.authorizedReadStatus).toBe(200)
          })
        })
      })

      test.describe("incorrect game password", () => {
        let creator: APIRequestContext | undefined
        let session: APIRequestContext | undefined
        let scenario: { responseStatus: number; responseBody: unknown }

        test.beforeEach(async ({ playwright }) => {
          creator = await createApiContext(playwright)
          session = await createApiContext(playwright)
          const { gameId } = await createGame(creator)
          const response = await session.post(`/api/v1/games/${gameId}/join`, {
            data: { password: "incorrect-password" },
          })
          scenario = {
            responseStatus: response.status(),
            responseBody: await response.json(),
          }
        })

        test.afterEach(async () => {
          await creator?.dispose()
          await session?.dispose()
        })

        test("returns an incorrect-password response", () => {
          expect(scenario.responseStatus).toBe(401)
          expect(scenario.responseBody).toMatchObject({
            error: ApiErrorCode.INCORRECT_GAME_PASSWORD,
          })
        })
      })
    })
  })

  test.describe("GET /api/v1/games/:gameId", () => {
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
            `/api/v1/games/${fixture.gameId}`,
            "get"
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
        responseStatus: number
        responseBody: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const response = await session.get(`/api/v1/games/${fixture.gameId}`)
        scenario = {
          responseStatus: response.status(),
          responseBody: await response.json(),
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("returns the game snapshot", () => {
        expect(scenario.responseStatus).toBe(200)
        expect(scenario.responseBody).toMatchObject({
          gameId: expect.any(String),
          name: TEST_FIXTURES.game.name,
          teams: [],
        })
      })
    })
  })

  test.describe("PATCH /api/v1/games/:gameId", () => {
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
            `/api/v1/games/${fixture.gameId}`,
            "patch",
            { name: "Updated Playwright game" }
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
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const response = await session.patch(
          `/api/v1/games/${fixture.gameId}`,
          { data: { name: "Updated Playwright game" } }
        )
        scenario = {
          gameId: fixture.gameId,
          ...(await captureGameMutation(session, fixture.gameId, response)),
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("returns and persists the updated game name", async () => {
        await test.step("API response", () => {
          expect(scenario.responseStatus).toBe(200)
          expect(scenario.responseBody).toMatchObject({
            gameId: scenario.gameId,
            name: "Updated Playwright game",
          })
        })

        await test.step("Redis game state", () => {
          expect(scenario.gameState).toMatchObject({
            gameId: scenario.gameId,
            name: "Updated Playwright game",
          })
        })
      })

      test("updates the game level", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }

        const response = await activeSession.patch(
          `/api/v1/games/${scenario.gameId}`,
          { data: { level: 1 } }
        )
        expect(response.status()).toBe(200)
        expect(await response.json()).toMatchObject({
          gameId: scenario.gameId,
          name: "Updated Playwright game",
          level: 1,
        })
        expect(await readGame(activeSession, scenario.gameId)).toMatchObject({
          gameId: scenario.gameId,
          name: "Updated Playwright game",
          level: 1,
        })
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = session
        if (!activeSession) {
          throw new Error("Game session was not initialized")
        }
        await deleteGameRecord(scenario.gameId)

        const response = await activeSession.patch(
          `/api/v1/games/${scenario.gameId}`,
          { data: { name: "Updated Playwright game" } }
        )
        expect(response.status()).toBe(404)
        expect(await response.json()).toMatchObject({
          error: ApiErrorCode.GAME_NOT_FOUND,
        })
      })
    })
  })
})
