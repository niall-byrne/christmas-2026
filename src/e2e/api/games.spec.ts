import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import {
  ApiErrorCode,
  GAME_COMPLETE_LEVEL,
  GAME_COMPLETE_TTL_SECONDS,
} from "@/contracts/game/api/data"
import {
  captureResponse,
  createApiContext,
  requireGameSession,
  sendRequest,
} from "@/e2e/resources/api"
import {
  captureGameMutation,
  createGame,
  createGameSession,
  readGame,
} from "@/e2e/resources/games"
import { addPlayer } from "@/e2e/resources/players"
import {
  createTestRedisClient,
  deleteGameRecord,
  readGameKeyTTLs,
  subscribeToGameStateEvents,
} from "@/e2e/resources/redis"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { createTeam } from "@/e2e/resources/teams"
import { redisKeys } from "@/game/api/redis/redisKeys"

const RATE_LIMITED_CLIENT_IP = "2001:db8::1"

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
              revision: 1,
              recipients: ["Alice", "Bob"],
            })
          })
        })
      })

      test.describe("when the IP request limit is exhausted", () => {
        let context: APIRequestContext | undefined
        let scenario: {
          responseStatus: number
          responseBody: unknown
          retryAfter: string | null
        }

        test.beforeEach(async ({ playwright }) => {
          context = await createApiContext(playwright)

          for (let attempt = 0; attempt < 10; attempt += 1) {
            const response = await context.post("/api/v1/games", {
              data: TEST_FIXTURES.game,
              headers: {
                "x-vercel-forwarded-for": RATE_LIMITED_CLIENT_IP,
              },
            })
            expect(response.status()).toBe(201)
          }

          const response = await context.post("/api/v1/games", {
            data: TEST_FIXTURES.game,
            headers: {
              "x-vercel-forwarded-for": RATE_LIMITED_CLIENT_IP,
            },
          })
          scenario = {
            responseStatus: response.status(),
            responseBody: await response.json(),
            retryAfter: response.headers()["retry-after"] ?? null,
          }
        })

        test.afterEach(async () => {
          await context?.dispose()
        })

        test("rejects the next game creation and returns the retry delay", () => {
          expect(scenario.responseStatus).toBe(429)
          expect(scenario.responseBody).toMatchObject({
            error: ApiErrorCode.RATE_LIMITED,
          })
          expect(scenario.retryAfter).toBe("900")
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
    test.describe("when creation and join requests reach the IP limit", () => {
      let creator: APIRequestContext | undefined
      let session: APIRequestContext | undefined
      let scenario: {
        responseStatus: number
        responseBody: unknown
        retryAfter: string | null
      }

      test.beforeEach(async ({ playwright }) => {
        creator = await createApiContext(playwright)
        session = await createApiContext(playwright)
        const createResponse = await creator.post("/api/v1/games", {
          data: TEST_FIXTURES.game,
          headers: {
            "x-vercel-forwarded-for": RATE_LIMITED_CLIENT_IP,
          },
        })
        expect(createResponse.status()).toBe(201)
        const { gameId } = await createResponse.json()
        const path = `/api/v1/games/${gameId}/join`

        const failedJoin = await session.post(path, {
          data: { password: "incorrect-password" },
          headers: {
            "x-vercel-forwarded-for": RATE_LIMITED_CLIENT_IP,
          },
        })
        expect(failedJoin.status()).toBe(401)

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const response = await session.post(path, {
            data: { password: TEST_FIXTURES.game.password },
            headers: {
              "x-vercel-forwarded-for": RATE_LIMITED_CLIENT_IP,
            },
          })
          expect(response.status()).toBe(200)
        }

        const response = await session.post(path, {
          data: { password: TEST_FIXTURES.game.password },
          headers: {
            "x-vercel-forwarded-for": RATE_LIMITED_CLIENT_IP,
          },
        })
        scenario = {
          responseStatus: response.status(),
          responseBody: await response.json(),
          retryAfter: response.headers()["retry-after"] ?? null,
        }
      })

      test.afterEach(async () => {
        await creator?.dispose()
        await session?.dispose()
      })

      test("counts every request across both endpoints", () => {
        expect(scenario.responseStatus).toBe(429)
        expect(scenario.responseBody).toMatchObject({
          error: ApiErrorCode.RATE_LIMITED,
        })
        expect(scenario.retryAfter).toBe("900")
      })
    })

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
      let eventSubscription:
        Awaited<ReturnType<typeof subscribeToGameStateEvents>> | undefined
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
        await eventSubscription?.close()
        eventSubscription = undefined
        await session?.dispose()
      })

      test.describe("when the stored revision is invalid", () => {
        let redis: ReturnType<typeof createTestRedisClient>
        let gameHashBefore: Record<string, string>
        let responseStatus: number

        test.beforeEach(async () => {
          redis = createTestRedisClient()
          gameHashBefore = await redis.hgetall(redisKeys.game(scenario.gameId))
          await redis.hset(
            redisKeys.game(scenario.gameId),
            "revision",
            TEST_FIXTURES.redis.invalidRevision
          )
          eventSubscription = await subscribeToGameStateEvents(scenario.gameId)

          const activeSession = requireGameSession(session)
          const response = await activeSession.patch(
            `/api/v1/games/${scenario.gameId}`,
            { data: { name: "Should not be persisted" } }
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await redis.quit()
        })

        test("leaves the game name and revision unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(await redis.hgetall(redisKeys.game(scenario.gameId))).toEqual({
            ...gameHashBefore,
            revision: TEST_FIXTURES.redis.invalidRevision,
          })
          const receivedEvent = await eventSubscription?.hasMessageAfterPing()
          expect(receivedEvent).toBe(false)
        })
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
        const activeSession = requireGameSession(session)

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

      test.describe("when a game update changes state", () => {
        let beforeRevision: number
        let responseStatus: number
        let event: unknown
        let state: Awaited<ReturnType<typeof readGame>>

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)
          eventSubscription = await subscribeToGameStateEvents(scenario.gameId)
          beforeRevision = (await readGame(activeSession, scenario.gameId))
            .revision
          const response = await activeSession.patch(
            `/api/v1/games/${scenario.gameId}`,
            { data: { level: 1 } }
          )
          responseStatus = response.status()
          event = await eventSubscription.nextMessage()
          state = await readGame(activeSession, scenario.gameId)
        })

        test("publishes the complete updated game snapshot", () => {
          expect(responseStatus).toBe(200)
          expect(event).toEqual({
            type: "game.state.changed",
            data: state,
          })
          expect(state.revision).toBe(beforeRevision + 1)
        })
      })

      test.describe("when the requested game name is unchanged", () => {
        let responseStatus: number
        let before: Awaited<ReturnType<typeof readGame>>
        let after: Awaited<ReturnType<typeof readGame>>
        let receivedEvent: boolean

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)
          before = await readGame(activeSession, scenario.gameId)
          eventSubscription = await subscribeToGameStateEvents(scenario.gameId)
          const response = await activeSession.patch(
            `/api/v1/games/${scenario.gameId}`,
            { data: { name: before.name } }
          )
          responseStatus = response.status()
          after = await readGame(activeSession, scenario.gameId)
          receivedEvent = await eventSubscription.hasMessageAfterPing()
        })

        test("keeps the revision unchanged and publishes no event", () => {
          expect(responseStatus).toBe(200)
          expect(after).toEqual(before)
          expect(receivedEvent).toBe(false)
        })
      })

      test("rejects a null game level", async () => {
        const activeSession = requireGameSession(session)

        const response = await activeSession.patch(
          `/api/v1/games/${scenario.gameId}`,
          { data: { level: null } }
        )
        expect(response.status()).toBe(400)
        expect(await response.json()).toMatchObject({
          error: ApiErrorCode.INVALID_LEVEL,
        })
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = requireGameSession(session)
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

      test.describe("when the game reaches the completed level", () => {
        let completionScenario: {
          responseStatus: number
          responseBody: unknown
          keyTTLs: { key: string; ttl: number }[]
        }

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)

          const { teamId } = await createTeam(activeSession, scenario.gameId)
          await addPlayer(activeSession, scenario.gameId, teamId)
          const response = await activeSession.patch(
            `/api/v1/games/${scenario.gameId}`,
            { data: { level: GAME_COMPLETE_LEVEL } }
          )
          completionScenario = {
            responseStatus: response.status(),
            responseBody: await response.json(),
            keyTTLs: await readGameKeyTTLs(scenario.gameId),
          }
        })

        test("returns the completed game level", () => {
          expect(completionScenario.responseStatus).toBe(200)
          expect(completionScenario.responseBody).toMatchObject({
            gameId: scenario.gameId,
            level: GAME_COMPLETE_LEVEL,
          })
        })

        test("expires every game key for the configured retention period", () => {
          expect(completionScenario.keyTTLs.length).toBeGreaterThan(0)
          for (const { key, ttl } of completionScenario.keyTTLs) {
            expect(
              ttl,
              `${key} should have a 24-hour expiration`
            ).toBeGreaterThanOrEqual(GAME_COMPLETE_TTL_SECONDS - 60)
            expect(ttl).toBeLessThanOrEqual(GAME_COMPLETE_TTL_SECONDS)
          }
        })
      })

      test.describe("when completing a game with an invalid team-player index", () => {
        let redis: ReturnType<typeof createTestRedisClient>
        let teamId: string
        let gameHashBefore: Record<string, string>
        let teamHashBefore: Record<string, string>
        let keyTTLsBefore: { key: string; ttl: number }[]
        let responseStatus: number

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)

          redis = createTestRedisClient()
          const team = await createTeam(activeSession, scenario.gameId)
          teamId = team.teamId
          await addPlayer(activeSession, scenario.gameId, teamId)
          gameHashBefore = await redis.hgetall(redisKeys.game(scenario.gameId))
          teamHashBefore = await redis.hgetall(
            redisKeys.team(scenario.gameId, teamId)
          )
          await redis.set(
            redisKeys.teamPlayers(scenario.gameId, teamId),
            TEST_FIXTURES.redis.wrongTypeValue
          )
          keyTTLsBefore = await readGameKeyTTLs(scenario.gameId)

          const response = await activeSession.patch(
            `/api/v1/games/${scenario.gameId}`,
            { data: { level: GAME_COMPLETE_LEVEL } }
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await redis.quit()
        })

        test("keeps game state and expiration times unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(await redis.hgetall(redisKeys.game(scenario.gameId))).toEqual(
            gameHashBefore
          )
          expect(
            await redis.hgetall(redisKeys.team(scenario.gameId, teamId))
          ).toEqual(teamHashBefore)
          expect(
            await redis.get(redisKeys.teamPlayers(scenario.gameId, teamId))
          ).toBe(TEST_FIXTURES.redis.wrongTypeValue)
          expect(await readGameKeyTTLs(scenario.gameId)).toEqual(keyTTLsBefore)
        })
      })
    })
  })
})
