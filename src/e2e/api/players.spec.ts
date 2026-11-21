import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import { ApiErrorCode } from "@/contracts/gameData"
import {
  captureResponse,
  createApiContext,
  requireGameSession,
  sendRequest,
} from "@/e2e/resources/api"
import {
  captureGameMutation,
  createGameSession,
  readGame,
} from "@/e2e/resources/games"
import { addPlayer } from "@/e2e/resources/players"
import {
  createTestRedisClient,
  deleteGameRecord,
  subscribeToGameStateEvents,
} from "@/e2e/resources/redis"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { createTeam } from "@/e2e/resources/teams"
import { redisKeys } from "@/lib/game/redisKeys"

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
      test.describe("when the game-player index has the wrong Redis type", () => {
        let session: APIRequestContext | undefined
        let redis: ReturnType<typeof createTestRedisClient>
        let gameId: string
        let teamId: string
        let gameHashBefore: Record<string, string>
        let teamHashBefore: Record<string, string>
        let responseStatus: number

        test.beforeEach(async ({ playwright }) => {
          const fixture = await createGameSession(playwright)
          session = fixture.session
          redis = createTestRedisClient()
          gameId = fixture.gameId
          const activeSession = fixture.session
          const team = await createTeam(activeSession, gameId)
          teamId = team.teamId
          gameHashBefore = await redis.hgetall(redisKeys.game(gameId))
          teamHashBefore = await redis.hgetall(redisKeys.team(gameId, teamId))
          await redis.set(
            redisKeys.players(gameId),
            TEST_FIXTURES.redis.wrongTypeValue
          )

          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${teamId}/players`,
            { data: TEST_FIXTURES.player }
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await session?.dispose()
          await redis.quit()
        })

        test("leaves all player-creation state unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(await redis.hgetall(redisKeys.team(gameId, teamId))).toEqual(
            teamHashBefore
          )
          expect(await redis.hgetall(redisKeys.game(gameId))).toEqual(
            gameHashBefore
          )
          expect(await redis.scard(redisKeys.teamPlayers(gameId, teamId))).toBe(
            0
          )
          expect(
            await redis.sismember(redisKeys.playerNames(gameId), "alice")
          ).toBe(0)
          expect(await redis.get(redisKeys.players(gameId))).toBe(
            TEST_FIXTURES.redis.wrongTypeValue
          )
          expect(
            await redis.keys(
              `${redisKeys.team(gameId, teamId)}${redisKeys.playerKeyPrefixSuffix}*`
            )
          ).toEqual([])
        })
      })

      test.describe("when the stored revision is invalid", () => {
        let session: APIRequestContext | undefined
        let redis: ReturnType<typeof createTestRedisClient>
        let gameId: string
        let teamId: string
        let gameHashBefore: Record<string, string>
        let teamHashBefore: Record<string, string>
        let responseStatus: number

        test.beforeEach(async ({ playwright }) => {
          const fixture = await createGameSession(playwright)
          session = fixture.session
          redis = createTestRedisClient()
          gameId = fixture.gameId
          const activeSession = fixture.session
          const team = await createTeam(activeSession, gameId)
          teamId = team.teamId
          gameHashBefore = await redis.hgetall(redisKeys.game(gameId))
          teamHashBefore = await redis.hgetall(redisKeys.team(gameId, teamId))
          await redis.hset(
            redisKeys.game(gameId),
            "revision",
            TEST_FIXTURES.redis.invalidRevision
          )

          const response = await activeSession.post(
            `/api/v1/games/${gameId}/teams/${teamId}/players`,
            { data: TEST_FIXTURES.player }
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await session?.dispose()
          await redis.quit()
        })

        test("leaves player records and indexes unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(await redis.hgetall(redisKeys.game(gameId))).toEqual({
            ...gameHashBefore,
            revision: TEST_FIXTURES.redis.invalidRevision,
          })
          expect(await redis.hgetall(redisKeys.team(gameId, teamId))).toEqual(
            teamHashBefore
          )
          expect(
            await redis.smembers(redisKeys.teamPlayers(gameId, teamId))
          ).toEqual([])
          expect(await redis.smembers(redisKeys.players(gameId))).toEqual([])
          expect(await redis.smembers(redisKeys.playerNames(gameId))).toEqual(
            []
          )
          expect(
            await redis.keys(
              `${redisKeys.team(gameId, teamId)}${redisKeys.playerKeyPrefixSuffix}*`
            )
          ).toEqual([])
        })
      })

      test.describe("successful requests", () => {
        let session: APIRequestContext | undefined
        let eventSubscription:
          Awaited<ReturnType<typeof subscribeToGameStateEvents>> | undefined
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
          await eventSubscription?.close()
          eventSubscription = undefined
          await session?.dispose()
        })

        test("adds the player and persists it", async () => {
          const activeSession = requireGameSession(session)

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

        test.describe("when a player is added", () => {
          let beforeRevision: number
          let responseStatus: number
          let event: unknown
          let state: Awaited<ReturnType<typeof readGame>>

          test.beforeEach(async () => {
            const activeSession = requireGameSession(session)
            beforeRevision = (await readGame(activeSession, gameId)).revision
            eventSubscription = await subscribeToGameStateEvents(gameId)
            const response = await activeSession.post(
              `/api/v1/games/${gameId}/teams/${teamId}/players`,
              { data: { name: "Bob" } }
            )
            responseStatus = response.status()
            event = await eventSubscription.nextMessage()
            state = await readGame(activeSession, gameId)
          })

          test("publishes the complete changed game snapshot", () => {
            expect(responseStatus).toBe(201)
            expect(event).toEqual({
              type: "game.state.changed",
              data: state,
            })
            expect(state.revision).toBe(beforeRevision + 1)
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
          const activeSession = requireGameSession(session)

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
          const activeSession = requireGameSession(session)

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
          const activeSession = requireGameSession(session)

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
          const activeSession = requireGameSession(session)

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
          const activeSession = requireGameSession(session)

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
      const activeSession = requireGameSession(session)

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
      let eventSubscription:
        Awaited<ReturnType<typeof subscribeToGameStateEvents>> | undefined
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
        await eventSubscription?.close()
        eventSubscription = undefined
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

      test.describe("when the player is already ready", () => {
        let responseStatus: number
        let before: Awaited<ReturnType<typeof readGame>>
        let after: Awaited<ReturnType<typeof readGame>>
        let receivedEvent: boolean

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)
          before = await readGame(activeSession, scenario.gameId)
          eventSubscription = await subscribeToGameStateEvents(scenario.gameId)
          const response = await activeSession.post(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${scenario.playerId}/ready`
          )
          responseStatus = response.status()
          after = await readGame(activeSession, scenario.gameId)
          receivedEvent = await eventSubscription.hasMessageAfterPing()
        })

        test("keeps the game revision unchanged and publishes no event", () => {
          expect(responseStatus).toBe(200)
          expect(after).toEqual(before)
          expect(receivedEvent).toBe(false)
        })
      })

      test.describe("when the stored revision is invalid", () => {
        let redis: ReturnType<typeof createTestRedisClient>
        let playerHashBefore: Record<string, string>
        let gameHashBefore: Record<string, string>
        let responseStatus: number

        test.beforeEach(async () => {
          redis = createTestRedisClient()
          playerHashBefore = await redis.hgetall(
            redisKeys.player(
              scenario.gameId,
              scenario.teamId,
              scenario.playerId
            )
          )
          gameHashBefore = await redis.hgetall(redisKeys.game(scenario.gameId))
          await redis.hset(
            redisKeys.game(scenario.gameId),
            "revision",
            TEST_FIXTURES.redis.invalidRevision
          )

          const activeSession = requireGameSession(session)
          const response = await activeSession.post(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${scenario.playerId}/ready`
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await redis.quit()
        })

        test("leaves ready status and revision unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(
            await redis.hgetall(
              redisKeys.player(
                scenario.gameId,
                scenario.teamId,
                scenario.playerId
              )
            )
          ).toEqual(playerHashBefore)
          expect(await redis.hgetall(redisKeys.game(scenario.gameId))).toEqual({
            ...gameHashBefore,
            revision: TEST_FIXTURES.redis.invalidRevision,
          })
        })
      })

      test("returns player not found when the player does not exist", async () => {
        const activeSession = requireGameSession(session)

        const missingPlayer = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${MISSING_ENTITY_ID}/ready`
        )
        expect(missingPlayer.status()).toBe(404)
        expect(await missingPlayer.json()).toMatchObject({
          error: ApiErrorCode.PLAYER_NOT_FOUND,
        })
      })

      test("returns team not found when the team does not exist", async () => {
        const activeSession = requireGameSession(session)
        const missingTeam = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams/${MISSING_ENTITY_ID}/players/${scenario.playerId}/ready`
        )
        expect(missingTeam.status()).toBe(404)
        expect(await missingTeam.json()).toMatchObject({
          error: ApiErrorCode.TEAM_NOT_FOUND,
        })
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = requireGameSession(session)
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
      let eventSubscription:
        Awaited<ReturnType<typeof subscribeToGameStateEvents>> | undefined
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
        await eventSubscription?.close()
        eventSubscription = undefined
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

      test.describe("when a ready player's status changes", () => {
        let beforeRevision: number
        let responseStatus: number
        let event: unknown
        let state: Awaited<ReturnType<typeof readGame>>

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)
          await activeSession.post(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${scenario.playerId}/ready`
          )
          beforeRevision = (await readGame(activeSession, scenario.gameId))
            .revision
          eventSubscription = await subscribeToGameStateEvents(scenario.gameId)
          const response = await activeSession.delete(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${scenario.playerId}/ready`
          )
          responseStatus = response.status()
          event = await eventSubscription.nextMessage()
          state = await readGame(activeSession, scenario.gameId)
        })

        test("publishes the complete changed game snapshot", () => {
          expect(responseStatus).toBe(200)
          expect(event).toEqual({
            type: "game.state.changed",
            data: state,
          })
          expect(state.revision).toBe(beforeRevision + 1)
        })
      })

      test.describe("when the stored revision is invalid", () => {
        let redis: ReturnType<typeof createTestRedisClient>
        let playerHashBefore: Record<string, string>
        let gameHashBefore: Record<string, string>
        let responseStatus: number

        test.beforeEach(async () => {
          redis = createTestRedisClient()
          playerHashBefore = await redis.hgetall(
            redisKeys.player(
              scenario.gameId,
              scenario.teamId,
              scenario.playerId
            )
          )
          gameHashBefore = await redis.hgetall(redisKeys.game(scenario.gameId))
          await redis.hset(
            redisKeys.game(scenario.gameId),
            "revision",
            TEST_FIXTURES.redis.invalidRevision
          )

          const activeSession = requireGameSession(session)
          const response = await activeSession.delete(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${scenario.playerId}/ready`
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await redis.quit()
        })

        test("leaves ready status and revision unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(
            await redis.hgetall(
              redisKeys.player(
                scenario.gameId,
                scenario.teamId,
                scenario.playerId
              )
            )
          ).toEqual(playerHashBefore)
          expect(await redis.hgetall(redisKeys.game(scenario.gameId))).toEqual({
            ...gameHashBefore,
            revision: TEST_FIXTURES.redis.invalidRevision,
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
      let eventSubscription:
        Awaited<ReturnType<typeof subscribeToGameStateEvents>> | undefined
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
        await eventSubscription?.close()
        eventSubscription = undefined
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

      test.describe("when a player is removed", () => {
        let beforeRevision: number
        let responseStatus: number
        let event: unknown
        let state: Awaited<ReturnType<typeof readGame>>

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)
          const { playerId } = await addPlayer(
            activeSession,
            scenario.gameId,
            scenario.teamId
          )
          beforeRevision = (await readGame(activeSession, scenario.gameId))
            .revision
          eventSubscription = await subscribeToGameStateEvents(scenario.gameId)
          const response = await activeSession.delete(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${playerId}`
          )
          responseStatus = response.status()
          event = await eventSubscription.nextMessage()
          state = await readGame(activeSession, scenario.gameId)
        })

        test("publishes the complete changed game snapshot", () => {
          expect(responseStatus).toBe(200)
          expect(event).toEqual({
            type: "game.state.changed",
            data: state,
          })
          expect(state.revision).toBe(beforeRevision + 1)
        })
      })

      test.describe("when the game-player index has the wrong Redis type", () => {
        let redis: ReturnType<typeof createTestRedisClient>
        let playerId: string
        let playerBefore: Record<string, string>
        let teamPlayersBefore: string[]
        let playerNamesBefore: string[]
        let gameHashBefore: Record<string, string>
        let responseStatus: number

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)
          redis = createTestRedisClient()
          const player = await addPlayer(
            activeSession,
            scenario.gameId,
            scenario.teamId
          )
          playerId = player.playerId
          playerBefore = await redis.hgetall(
            redisKeys.player(scenario.gameId, scenario.teamId, playerId)
          )
          teamPlayersBefore = await redis.smembers(
            redisKeys.teamPlayers(scenario.gameId, scenario.teamId)
          )
          playerNamesBefore = await redis.smembers(
            redisKeys.playerNames(scenario.gameId)
          )
          gameHashBefore = await redis.hgetall(redisKeys.game(scenario.gameId))
          await redis.set(
            redisKeys.players(scenario.gameId),
            TEST_FIXTURES.redis.wrongTypeValue
          )

          const response = await activeSession.delete(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${playerId}`
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await redis.quit()
        })

        test("leaves player records and team membership unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(
            await redis.hgetall(
              redisKeys.player(scenario.gameId, scenario.teamId, playerId)
            )
          ).toEqual(playerBefore)
          expect(
            await redis.smembers(
              redisKeys.teamPlayers(scenario.gameId, scenario.teamId)
            )
          ).toEqual(teamPlayersBefore)
          expect(
            await redis.smembers(redisKeys.playerNames(scenario.gameId))
          ).toEqual(playerNamesBefore)
          expect(await redis.get(redisKeys.players(scenario.gameId))).toBe(
            TEST_FIXTURES.redis.wrongTypeValue
          )
          expect(await redis.hgetall(redisKeys.game(scenario.gameId))).toEqual(
            gameHashBefore
          )
        })
      })

      test.describe("when the stored revision is invalid", () => {
        let redis: ReturnType<typeof createTestRedisClient>
        let playerId: string
        let playerBefore: Record<string, string>
        let teamPlayersBefore: string[]
        let gamePlayersBefore: string[]
        let playerNamesBefore: string[]
        let gameHashBefore: Record<string, string>
        let responseStatus: number

        test.beforeEach(async () => {
          const activeSession = requireGameSession(session)
          redis = createTestRedisClient()
          const player = await addPlayer(
            activeSession,
            scenario.gameId,
            scenario.teamId
          )
          playerId = player.playerId
          playerBefore = await redis.hgetall(
            redisKeys.player(scenario.gameId, scenario.teamId, playerId)
          )
          teamPlayersBefore = await redis.smembers(
            redisKeys.teamPlayers(scenario.gameId, scenario.teamId)
          )
          gamePlayersBefore = await redis.smembers(
            redisKeys.players(scenario.gameId)
          )
          playerNamesBefore = await redis.smembers(
            redisKeys.playerNames(scenario.gameId)
          )
          gameHashBefore = await redis.hgetall(redisKeys.game(scenario.gameId))
          await redis.hset(
            redisKeys.game(scenario.gameId),
            "revision",
            TEST_FIXTURES.redis.invalidRevision
          )

          const response = await activeSession.delete(
            `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${playerId}`
          )
          responseStatus = response.status()
        })

        test.afterEach(async () => {
          await redis.quit()
        })

        test("leaves player records and indexes unchanged", async () => {
          expect(responseStatus).toBe(500)
          expect(
            await redis.hgetall(
              redisKeys.player(scenario.gameId, scenario.teamId, playerId)
            )
          ).toEqual(playerBefore)
          expect(
            await redis.smembers(
              redisKeys.teamPlayers(scenario.gameId, scenario.teamId)
            )
          ).toEqual(teamPlayersBefore)
          expect(
            await redis.smembers(redisKeys.players(scenario.gameId))
          ).toEqual(gamePlayersBefore)
          expect(
            await redis.smembers(redisKeys.playerNames(scenario.gameId))
          ).toEqual(playerNamesBefore)
          expect(await redis.hgetall(redisKeys.game(scenario.gameId))).toEqual({
            ...gameHashBefore,
            revision: TEST_FIXTURES.redis.invalidRevision,
          })
        })
      })

      test("returns player not found when the player does not exist", async () => {
        const activeSession = requireGameSession(session)

        const missingPlayer = await activeSession.delete(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players/${MISSING_ENTITY_ID}`
        )
        expect(missingPlayer.status()).toBe(404)
        expect(await missingPlayer.json()).toMatchObject({
          error: ApiErrorCode.PLAYER_NOT_FOUND,
        })
      })

      test("returns team not found when the team does not exist", async () => {
        const activeSession = requireGameSession(session)
        const missingTeam = await activeSession.delete(
          `/api/v1/games/${scenario.gameId}/teams/${MISSING_ENTITY_ID}/players/${scenario.playerId}`
        )
        expect(missingTeam.status()).toBe(404)
        expect(await missingTeam.json()).toMatchObject({
          error: ApiErrorCode.TEAM_NOT_FOUND,
        })
      })

      test("releases the player's name after deletion", async () => {
        const activeSession = requireGameSession(session)
        const reAddedPlayer = await activeSession.post(
          `/api/v1/games/${scenario.gameId}/teams/${scenario.teamId}/players`,
          { data: TEST_FIXTURES.player }
        )
        expect(reAddedPlayer.status()).toBe(201)
      })

      test("returns game not found when the game does not exist", async () => {
        const activeSession = requireGameSession(session)
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
