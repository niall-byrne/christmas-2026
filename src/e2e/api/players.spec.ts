import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import { ApiErrorCode } from "@/contracts/game/api/data"
import {
  captureResponse,
  createApiContext,
  createPlayerApiContext,
  requireGameSession,
  sendRequest,
} from "@/e2e/resources/api"
import {
  captureGameMutation,
  createGameSession,
  readGame,
} from "@/e2e/resources/games"
import { claimPlayer } from "@/e2e/resources/players"
import { createTestRedisClient } from "@/e2e/resources/redis"
import { createTeam } from "@/e2e/resources/teams"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { redisKeys } from "@/game/api/redis/redisKeys"

const MISSING_ENTITY_ID = "000000000000000000000000"

const GAME_WITH_THREE_PLAYERS = {
  ...TEST_FIXTURES.game,
  cards: [
    ...TEST_FIXTURES.game.cards,
    { recipient: "Cara", identifier: "card-cara" },
  ],
}
const GAME_WITH_FOUR_PLAYERS = {
  ...GAME_WITH_THREE_PLAYERS,
  cards: [
    ...GAME_WITH_THREE_PLAYERS.cards,
    { recipient: "Dan", identifier: "card-dan" },
  ],
}

function playersPath(gameId: string) {
  return `/api/v1/games/${gameId}/players`
}

function readyPath(gameId: string) {
  return `${playersPath(gameId)}/ready`
}

function teamPlayersPath(gameId: string, teamId: string) {
  return `/api/v1/games/${gameId}/teams/${teamId}/players`
}

function teamPath(gameId: string, teamId: string) {
  return `/api/v1/games/${gameId}/teams/${teamId}`
}

function removeVotePath(gameId: string, playerId: string) {
  return `${playersPath(gameId)}/${playerId}/remove-vote`
}

async function setInvalidRevision(
  gameId: string,
  redis = createTestRedisClient()
) {
  await redis.hset(
    redisKeys.game(gameId),
    "revision",
    TEST_FIXTURES.redis.invalidRevision
  )
  return redis
}

test.describe("Player API endpoints", () => {
  test.describe("POST /api/v1/games/:gameId/players", () => {
    test.describe("requests without a valid game session", () => {
      let session: APIRequestContext | undefined
      let anonymousSession: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        anonymousSession = await createApiContext(playwright)
        scenario = await captureResponse(
          await sendRequest(
            anonymousSession,
            playersPath(fixture.gameId),
            "post",
            TEST_FIXTURES.player
          )
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
        await anonymousSession?.dispose()
      })

      test("returns unauthorized", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("requests with a valid game session", () => {
      let session: APIRequestContext | undefined
      let gameId: string

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        gameId = fixture.gameId
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("claims an unassigned player and reserves the recipient name", async () => {
        const activeSession = requireGameSession(session)
        const response = await activeSession.post(playersPath(gameId), {
          data: TEST_FIXTURES.player,
        })
        const result = await captureGameMutation(
          activeSession,
          gameId,
          response
        )
        expect(result.responseStatus).toBe(201)
        expect(result.responseBody).toMatchObject({
          name: TEST_FIXTURES.player.name,
          teamId: null,
        })
        expect(result.gameState).toMatchObject({
          unassignedPlayers: [
            {
              name: TEST_FIXTURES.player.name,
              ready: false,
            },
          ],
          teams: [],
        })
      })

      test("resolves a case-insensitive name to its canonical spelling", async ({
        playwright,
      }) => {
        const roomSession = requireGameSession(session)
        const isolatedSession = await createPlayerApiContext(
          playwright,
          roomSession
        )
        const response = await isolatedSession.post(playersPath(gameId), {
          data: { name: "  alice  " },
        })
        expect(response.status()).toBe(201)
        expect(await response.json()).toMatchObject({
          name: TEST_FIXTURES.player.name,
          teamId: null,
        })
        await isolatedSession.dispose()
      })

      test("rejects a name that is not a game recipient without changing state", async ({
        playwright,
      }) => {
        const roomSession = requireGameSession(session)
        const isolatedSession = await createPlayerApiContext(
          playwright,
          roomSession
        )
        const revision = (await readGame(roomSession, gameId)).revision
        const response = await isolatedSession.post(playersPath(gameId), {
          data: { name: "Not a recipient" },
        })
        expect(response.status()).toBe(422)
        expect(await response.json()).toMatchObject({
          error: ApiErrorCode.RECIPIENT_NOT_FOUND,
        })
        expect((await readGame(roomSession, gameId)).revision).toBe(revision)
        await isolatedSession.dispose()
      })
    })

    test.describe("when the stored revision is invalid", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let scenario: { status: number; body: unknown }
      let playerIds: string[]
      let playerNames: string[]

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        redis = await setInvalidRevision(gameId)
        scenario = await captureResponse(
          await session.post(playersPath(gameId), {
            data: TEST_FIXTURES.player,
          })
        )
        playerIds = await redis.smembers(redisKeys.players(gameId))
        playerNames = await redis.smembers(redisKeys.playerNames(gameId))
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("does not create a partial player claim", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(playerIds).toEqual([])
        expect(playerNames).toEqual([])
        await expect(
          redis.keys(`${redisKeys.game(gameId)}:player:*`)
        ).resolves.toEqual([])
      })
    })

    test.describe("when the player index has the wrong Redis type", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let gameBefore: Record<string, string>
      let scenario: { status: number; body: unknown }
      let playerNames: string[]

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        redis = createTestRedisClient()
        gameBefore = await redis.hgetall(redisKeys.game(gameId))
        await redis.set(
          redisKeys.players(gameId),
          TEST_FIXTURES.redis.wrongTypeValue
        )
        scenario = await captureResponse(
          await session.post(playersPath(gameId), {
            data: TEST_FIXTURES.player,
          })
        )
        playerNames = await redis.smembers(redisKeys.playerNames(gameId))
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("leaves all player-claim state unchanged", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(await redis.hgetall(redisKeys.game(gameId))).toEqual(gameBefore)
        expect(await redis.get(redisKeys.players(gameId))).toBe(
          TEST_FIXTURES.redis.wrongTypeValue
        )
        expect(playerNames).toEqual([])
        await expect(
          redis.keys(`${redisKeys.game(gameId)}:player:*`)
        ).resolves.toEqual([])
      })
    })

    test.describe("when the caller already has a claim", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let scenario: { status: number; body: unknown }
      let playerId: string
      let revision: number

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        const initialClaim = await session.post(playersPath(gameId), {
          data: TEST_FIXTURES.player,
        })
        expect(initialClaim.status()).toBe(201)
        const initialState = await readGame(session, gameId)
        playerId = initialState.unassignedPlayers[0].playerId
        revision = initialState.revision
        scenario = await captureResponse(
          await session.post(playersPath(gameId), {
            data: TEST_FIXTURES.player,
          })
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("returns the existing claim for an idempotent retry", () => {
        expect(scenario.status).toBe(200)
        expect(scenario.body).toMatchObject({
          playerId,
          name: TEST_FIXTURES.player.name,
          teamId: null,
        })
        return expect(
          readGame(requireGameSession(session), gameId)
        ).resolves.toMatchObject({ revision })
      })

      test("rejects claiming a second name with the same identity", async () => {
        const response = await requireGameSession(session).post(
          playersPath(gameId),
          { data: { name: "Bob" } }
        )
        expect(response.status()).toBe(409)
        expect(await response.json()).toMatchObject({
          error: ApiErrorCode.PLAYER_IDENTITY_EXISTS,
        })
      })
    })

    test.describe("when two players claim the same available name", () => {
      let roomSession: APIRequestContext | undefined
      let claimSessions: APIRequestContext[] = []
      let gameId: string
      let revisionBeforeClaims: number
      let responses: Awaited<ReturnType<APIRequestContext["post"]>>[]
      let finalRevision: number

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        roomSession = fixture.session
        claimSessions = await Promise.all([
          createPlayerApiContext(playwright, roomSession),
          createPlayerApiContext(playwright, roomSession),
        ])
        revisionBeforeClaims = (await readGame(roomSession, gameId)).revision
        responses = await Promise.all(
          claimSessions.map((claimSession) =>
            claimSession.post(playersPath(gameId), {
              data: TEST_FIXTURES.player,
            })
          )
        )
        finalRevision = (await readGame(roomSession, gameId)).revision
      })

      test.afterEach(async () => {
        await Promise.all(
          claimSessions.map((claimSession) => claimSession.dispose())
        )
        await roomSession?.dispose()
      })

      test("allows exactly one claim to succeed", async () => {
        expect(responses.map((response) => response.status()).sort()).toEqual([
          201, 409,
        ])
        const conflict = responses.find((response) => response.status() === 409)
        expect(conflict).toBeDefined()
        expect(await conflict?.json()).toMatchObject({
          error: ApiErrorCode.NAME_NOT_AVAILABLE,
        })
        expect(finalRevision).toBe(revisionBeforeClaims + 1)
      })
    })
  })

  test.describe("POST /api/v1/games/:gameId/teams/:teamId/players", () => {
    test.describe("when a claimed player joins a team", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let teamId: string
      let scenario: {
        responseStatus: number
        responseBody: unknown
        gameState: unknown
        setCookie: string | undefined
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        const response = await session.post(teamPlayersPath(gameId, teamId))
        scenario = {
          ...(await captureGameMutation(session, gameId, response)),
          setCookie: response.headers()["set-cookie"],
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("assigns the caller to the team", () => {
        expect(scenario.responseStatus).toBe(200)
        expect(scenario.responseBody).toMatchObject({ teamId })
        expect(scenario.gameState).toMatchObject({
          unassignedPlayers: [],
          teams: [
            {
              teamId,
              players: [{ name: TEST_FIXTURES.player.name }],
            },
          ],
        })
        expect(scenario.setCookie).toContain(`game_player_${gameId}=`)
        expect(scenario.setCookie).toContain("Max-Age=34560000")
        expect(scenario.setCookie).toContain("HttpOnly")
      })
    })

    test.describe("when the caller has no player claim", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let teamId: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        const playerSession = await createPlayerApiContext(playwright, session)
        try {
          scenario = await captureResponse(
            await playerSession.post(teamPlayersPath(gameId, teamId))
          )
        } finally {
          await playerSession.dispose()
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("rejects the request", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("when the requested team does not exist", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        scenario = await captureResponse(
          await session.post(teamPlayersPath(gameId, MISSING_ENTITY_ID))
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("returns team not found", () => {
        expect(scenario.status).toBe(404)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.TEAM_NOT_FOUND,
        })
      })
    })

    test.describe("when the game is no longer in the lobby", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let teamId: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        const start = await session.patch(`/api/v1/games/${gameId}`, {
          data: { level: 1 },
        })
        expect(start.status()).toBe(200)
        scenario = await captureResponse(
          await session.post(teamPlayersPath(gameId, teamId))
        )
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("rejects the assignment", () => {
        expect(scenario.status).toBe(409)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.GAME_NOT_IN_LOBBY,
        })
      })
    })

    test.describe("when the stored revision is invalid", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let teamId: string
      let playerId: string
      let playerBefore: Record<string, string>
      let scenario: { status: number; body: unknown }
      let teamMembers: string[]

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        redis = createTestRedisClient()
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        await setInvalidRevision(gameId, redis)
        scenario = await captureResponse(
          await session.post(teamPlayersPath(gameId, teamId))
        )
        teamMembers = await redis.smembers(
          redisKeys.teamPlayers(gameId, teamId)
        )
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("does not partially assign the player", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(teamMembers).toEqual([])
        expect(
          await redis.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
      })
    })

    test.describe("when the team membership key has the wrong Redis type", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let teamId: string
      let playerId: string
      let playerBefore: Record<string, string>
      let membersKey: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        redis = createTestRedisClient()
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        membersKey = redisKeys.teamPlayers(gameId, teamId)
        await redis.set(membersKey, TEST_FIXTURES.redis.wrongTypeValue)
        scenario = await captureResponse(
          await session.post(teamPlayersPath(gameId, teamId))
        )
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("does not partially assign the player", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await redis.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
        expect(await redis.get(membersKey)).toBe(
          TEST_FIXTURES.redis.wrongTypeValue
        )
      })
    })

    test.describe("when the current team record is malformed", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let currentTeamId: string
      let destinationTeamId: string
      let playerId: string
      let playerBefore: Record<string, string>
      let revisionBefore: string | null

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        currentTeamId = (await createTeam(session, gameId)).teamId
        const destinationTeamResponse = await session.post(
          `/api/v1/games/${gameId}/teams`,
          { data: { name: "Team Two", color: "#123456" } }
        )
        expect(destinationTeamResponse.status()).toBe(201)
        destinationTeamId = (await destinationTeamResponse.json()).teamId
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        expect(
          (await session.post(teamPlayersPath(gameId, currentTeamId))).status()
        ).toBe(200)
        redis = createTestRedisClient()
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        revisionBefore = await redis.hget(redisKeys.game(gameId), "revision")
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      async function expectSwitchRejectedWithoutMutation() {
        const response = await session!.post(
          teamPlayersPath(gameId, destinationTeamId)
        )
        expect(response.status()).toBe(500)
        expect(await response.json()).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await redis.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
        expect(
          await redis.smembers(redisKeys.teamPlayers(gameId, currentTeamId))
        ).toEqual([playerId])
        expect(
          await redis.smembers(redisKeys.teamPlayers(gameId, destinationTeamId))
        ).toEqual([])
        expect(await redis.hget(redisKeys.game(gameId), "revision")).toBe(
          revisionBefore
        )
      }

      test("rejects switching when the current team hash is missing", async () => {
        await redis.del(redisKeys.team(gameId, currentTeamId))

        await expectSwitchRejectedWithoutMutation()

        expect(await redis.exists(redisKeys.team(gameId, currentTeamId))).toBe(
          0
        )
      })

      test("rejects switching when the current team hash has the wrong type", async () => {
        await redis.set(
          redisKeys.team(gameId, currentTeamId),
          TEST_FIXTURES.redis.wrongTypeValue
        )

        await expectSwitchRejectedWithoutMutation()

        expect(await redis.get(redisKeys.team(gameId, currentTeamId))).toBe(
          TEST_FIXTURES.redis.wrongTypeValue
        )
      })
    })
  })

  test.describe("DELETE /api/v1/games/:gameId/teams/:teamId/players", () => {
    test.describe("when a claimed player leaves a team", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let teamId: string
      let scenario: {
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        await session.post(teamPlayersPath(gameId, teamId))
        const response = await session.delete(teamPlayersPath(gameId, teamId))
        scenario = await captureGameMutation(session, gameId, response)
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("returns the player to the unassigned list", () => {
        expect(scenario.responseStatus).toBe(200)
        expect(scenario.responseBody).toMatchObject({ teamId: null })
        expect(scenario.gameState).toMatchObject({
          unassignedPlayers: [
            { name: TEST_FIXTURES.player.name, ready: false },
          ],
          teams: [{ teamId, players: [] }],
        })
      })
    })

    test.describe("when the stored revision is invalid", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let teamId: string
      let playerId: string
      let playerBefore: Record<string, string>
      let scenario: { status: number; body: unknown }
      let teamMembers: string[]

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        await session.post(teamPlayersPath(gameId, teamId))
        redis = createTestRedisClient()
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        teamMembers = await redis.smembers(
          redisKeys.teamPlayers(gameId, teamId)
        )
        await setInvalidRevision(gameId, redis)
        scenario = await captureResponse(
          await session.delete(teamPlayersPath(gameId, teamId))
        )
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("keeps the player assigned and ready state unchanged", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await redis.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
        expect(
          await redis.smembers(redisKeys.teamPlayers(gameId, teamId))
        ).toEqual(teamMembers)
      })
    })
  })

  test.describe("DELETE /api/v1/games/:gameId/teams/:teamId", () => {
    test.describe("when a team with claimed players is deleted", () => {
      let session: APIRequestContext | undefined
      let playerSessions: APIRequestContext[] = []
      let gameId: string
      let scenario: {
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        const { teamId } = await createTeam(session, gameId)
        playerSessions = await Promise.all([
          createPlayerApiContext(playwright, session),
          createPlayerApiContext(playwright, session),
        ])
        await claimPlayer(playerSessions[0]!, gameId, "Alice")
        await claimPlayer(playerSessions[1]!, gameId, "Bob")
        await playerSessions[0]!.post(teamPlayersPath(gameId, teamId))
        await playerSessions[1]!.post(teamPlayersPath(gameId, teamId))
        const response = await session.delete(teamPath(gameId, teamId))
        scenario = await captureGameMutation(session, gameId, response)
      })

      test.afterEach(async () => {
        await Promise.all(
          playerSessions.map((playerSession) => playerSession.dispose())
        )
        await session?.dispose()
      })

      test("returns the players to the lobby as unassigned", () => {
        expect(scenario.responseStatus).toBe(200)
        expect(scenario.gameState).toMatchObject({
          teams: [],
          unassignedPlayers: expect.arrayContaining([
            expect.objectContaining({ name: "Alice", ready: false }),
            expect.objectContaining({ name: "Bob", ready: false }),
          ]),
        })
      })
    })

    test.describe("when the stored revision is invalid", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let teamId: string
      let playerId: string
      let teamBefore: Record<string, string>
      let playerBefore: Record<string, string>
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        teamId = (await createTeam(session, gameId)).teamId
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        await session.post(teamPlayersPath(gameId, teamId))
        redis = createTestRedisClient()
        teamBefore = await redis.hgetall(redisKeys.team(gameId, teamId))
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        await setInvalidRevision(gameId, redis)
        scenario = await captureResponse(
          await session.delete(teamPath(gameId, teamId))
        )
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("leaves the team and its player assignment unchanged", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(await redis.hgetall(redisKeys.team(gameId, teamId))).toEqual(
          teamBefore
        )
        expect(
          await redis.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
        expect(await redis.sismember(redisKeys.teams(gameId), teamId)).toBe(1)
      })
    })
  })

  test.describe("POST /api/v1/games/:gameId/players/ready", () => {
    test.describe("when a claimed player marks themselves ready", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let scenario: {
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        const teamId = (await createTeam(session, gameId)).teamId
        await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        await session.post(teamPlayersPath(gameId, teamId))
        const response = await session.post(readyPath(gameId))
        scenario = await captureGameMutation(session, gameId, response)
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("persists the ready state", () => {
        expect(scenario.responseStatus).toBe(200)
        expect(scenario.responseBody).toMatchObject({ ready: true })
        expect(scenario.gameState).toMatchObject({
          teams: [
            {
              players: [{ name: TEST_FIXTURES.player.name, ready: true }],
            },
          ],
        })
      })
    })

    test.describe("when the caller has no player claim", () => {
      let session: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const playerSession = await createPlayerApiContext(playwright, session)
        try {
          scenario = await captureResponse(
            await playerSession.post(readyPath(fixture.gameId))
          )
        } finally {
          await playerSession.dispose()
        }
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("rejects the request", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("when the stored revision is invalid", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let playerId: string
      let playerBefore: Record<string, string>
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        const teamId = (await createTeam(session, gameId)).teamId
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        await session.post(teamPlayersPath(gameId, teamId))
        redis = createTestRedisClient()
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        await setInvalidRevision(gameId, redis)
        scenario = await captureResponse(await session.post(readyPath(gameId)))
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("does not partially change the player's ready state", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await redis.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
      })
    })
  })

  test.describe("DELETE /api/v1/games/:gameId/players/ready", () => {
    test.describe("when a ready player becomes not ready", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let scenario: {
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        const teamId = (await createTeam(session, gameId)).teamId
        await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        await session.post(teamPlayersPath(gameId, teamId))
        await session.post(readyPath(gameId))
        const response = await session.delete(readyPath(gameId))
        scenario = await captureGameMutation(session, gameId, response)
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("persists the not-ready state", () => {
        expect(scenario.responseStatus).toBe(200)
        expect(scenario.responseBody).toMatchObject({ ready: false })
        expect(scenario.gameState).toMatchObject({
          teams: [
            {
              players: [{ name: TEST_FIXTURES.player.name, ready: false }],
            },
          ],
        })
      })
    })
  })

  test.describe("DELETE /api/v1/games/:gameId/players", () => {
    test.describe("when the caller has a player claim", () => {
      let session: APIRequestContext | undefined
      let gameId: string
      let scenario: {
        responseStatus: number
        responseBody: unknown
        gameState: unknown
      }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        const response = await session.delete(playersPath(gameId))
        scenario = await captureGameMutation(session, gameId, response)
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("removes the claim and releases the recipient name", async () => {
        expect(scenario.responseStatus).toBe(200)
        expect(scenario.responseBody).toMatchObject({
          message: "Player removed",
        })
        expect(scenario.gameState).toMatchObject({
          unassignedPlayers: [],
          teams: [],
        })
        const retry = await requireGameSession(session).post(
          playersPath(gameId),
          { data: TEST_FIXTURES.player }
        )
        expect(retry.status()).toBe(201)
      })
    })

    test.describe("when the caller has no player claim", () => {
      let session: APIRequestContext | undefined
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        session = fixture.session
        const playerSession = await createPlayerApiContext(playwright, session)
        scenario = await captureResponse(
          await playerSession.delete(playersPath(fixture.gameId))
        )
        await playerSession.dispose()
      })

      test.afterEach(async () => {
        await session?.dispose()
      })

      test("rejects the request", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("when the stored revision is invalid", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let playerId: string
      let playerBefore: Record<string, string>
      let playerIdsBefore: string[]
      let playerNamesBefore: string[]
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(playwright)
        gameId = fixture.gameId
        session = fixture.session
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        redis = createTestRedisClient()
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        playerIdsBefore = await redis.smembers(redisKeys.players(gameId))
        playerNamesBefore = await redis.smembers(redisKeys.playerNames(gameId))
        await setInvalidRevision(gameId, redis)
        scenario = await captureResponse(
          await session.delete(playersPath(gameId))
        )
      })

      test.afterEach(async () => {
        await redis.quit()
        await session?.dispose()
      })

      test("keeps the player claim and name reservation unchanged", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await redis.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
        expect(await redis.smembers(redisKeys.players(gameId))).toEqual(
          playerIdsBefore
        )
        expect(await redis.smembers(redisKeys.playerNames(gameId))).toEqual(
          playerNamesBefore
        )
      })
    })

    test.describe("when a pending vote key has the wrong Redis type", () => {
      let session: APIRequestContext | undefined
      let redis: ReturnType<typeof createTestRedisClient> | undefined
      let gameId: string
      let playerId: string
      let playerBefore: Record<string, string>
      let playerIdsBefore: string[]
      let playerNamesBefore: string[]
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(
          playwright,
          GAME_WITH_FOUR_PLAYERS
        )
        gameId = fixture.gameId
        session = fixture.session
        playerId = (
          await claimPlayer(session, gameId, TEST_FIXTURES.player.name)
        ).playerId
        redis = createTestRedisClient()
        playerBefore = await redis.hgetall(
          redisKeys.gamePlayer(gameId, playerId)
        )
        playerIdsBefore = await redis.smembers(redisKeys.players(gameId))
        playerNamesBefore = await redis.smembers(redisKeys.playerNames(gameId))
        await redis.set(
          redisKeys.removePlayerVote(gameId, playerId),
          TEST_FIXTURES.redis.wrongTypeValue
        )
        scenario = await captureResponse(
          await session.delete(playersPath(gameId))
        )
      })

      test.afterEach(async () => {
        await redis?.quit()
        await session?.dispose()
      })

      test("keeps the player claim and name reservation unchanged", async () => {
        const client = redis
        expect(client).toBeDefined()
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await client!.hgetall(redisKeys.gamePlayer(gameId, playerId))
        ).toEqual(playerBefore)
        expect(await client!.smembers(redisKeys.players(gameId))).toEqual(
          playerIdsBefore
        )
        expect(await client!.smembers(redisKeys.playerNames(gameId))).toEqual(
          playerNamesBefore
        )
        expect(
          await client!.get(redisKeys.removePlayerVote(gameId, playerId))
        ).toBe(TEST_FIXTURES.redis.wrongTypeValue)
      })
    })
  })

  test.describe("POST /api/v1/games/:gameId/players/:playerId/remove-vote", () => {
    test.describe("when another player requests a player's removal", () => {
      let session: APIRequestContext | undefined
      let playerSessions: APIRequestContext[] = []
      let gameId: string
      let targetPlayerId: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(
          playwright,
          GAME_WITH_FOUR_PLAYERS
        )
        gameId = fixture.gameId
        session = fixture.session
        playerSessions = await Promise.all(
          Array.from({ length: 4 }, () =>
            createPlayerApiContext(playwright, fixture.session)
          )
        )
        targetPlayerId = (
          await claimPlayer(playerSessions[0]!, gameId, "Alice")
        ).playerId
        await claimPlayer(playerSessions[1]!, gameId, "Bob")
        await claimPlayer(playerSessions[2]!, gameId, "Cara")
        await claimPlayer(playerSessions[3]!, gameId, "Dan")
        const response = await playerSessions[1]!.post(
          removeVotePath(gameId, targetPlayerId)
        )
        scenario = await captureResponse(response)
      })

      test.afterEach(async () => {
        await Promise.all(
          playerSessions.map((playerSession) => playerSession.dispose())
        )
        await session?.dispose()
      })

      test("records the request without removing the player before a vote", () => {
        expect(scenario.status).toBe(200)
        expect(scenario.body).toMatchObject({
          approvals: 1,
          requiredApprovals: 3,
          pending: true,
        })
      })
    })

    test.describe("when the caller has no player identity", () => {
      let session: APIRequestContext | undefined
      let targetSession: APIRequestContext | undefined
      let anonymousSession: APIRequestContext | undefined
      let gameId: string
      let targetPlayerId: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(
          playwright,
          GAME_WITH_THREE_PLAYERS
        )
        gameId = fixture.gameId
        session = fixture.session
        ;[targetSession, anonymousSession] = await Promise.all([
          createPlayerApiContext(playwright, session),
          createPlayerApiContext(playwright, session),
        ])
        targetPlayerId = (await claimPlayer(targetSession, gameId, "Bob"))
          .playerId
        scenario = await captureResponse(
          await anonymousSession.post(removeVotePath(gameId, targetPlayerId))
        )
      })

      test.afterEach(async () => {
        await anonymousSession?.dispose()
        await targetSession?.dispose()
        await session?.dispose()
      })

      test("rejects the removal request", () => {
        expect(scenario.status).toBe(401)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.UNAUTHORIZED,
        })
      })
    })

    test.describe("when the stored revision is invalid", () => {
      let roomSession: APIRequestContext | undefined
      let playerSessions: APIRequestContext[] = []
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let targetPlayerId: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(
          playwright,
          GAME_WITH_THREE_PLAYERS
        )
        gameId = fixture.gameId
        roomSession = fixture.session
        playerSessions = await Promise.all(
          Array.from({ length: 3 }, () =>
            createPlayerApiContext(playwright, fixture.session)
          )
        )
        targetPlayerId = (
          await claimPlayer(playerSessions[0]!, gameId, "Alice")
        ).playerId
        await claimPlayer(playerSessions[1]!, gameId, "Bob")
        await claimPlayer(playerSessions[2]!, gameId, "Cara")
        redis = createTestRedisClient()
        await setInvalidRevision(gameId, redis)
        scenario = await captureResponse(
          await playerSessions[1]!.post(removeVotePath(gameId, targetPlayerId))
        )
      })

      test.afterEach(async () => {
        await redis.quit()
        await Promise.all(
          playerSessions.map((playerSession) => playerSession.dispose())
        )
        await roomSession?.dispose()
      })

      test("does not create a partial removal vote", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await redis.exists(redisKeys.removePlayerVote(gameId, targetPlayerId))
        ).toBe(0)
        expect(
          await redis.exists(
            redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId)
          )
        ).toBe(0)
      })
    })

    test.describe("when the pending vote approvals key has the wrong Redis type", () => {
      let roomSession: APIRequestContext | undefined
      let playerSessions: APIRequestContext[] = []
      let redis: ReturnType<typeof createTestRedisClient>
      let gameId: string
      let targetPlayerId: string
      let approvalsKey: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(
          playwright,
          GAME_WITH_FOUR_PLAYERS
        )
        gameId = fixture.gameId
        roomSession = fixture.session
        playerSessions = await Promise.all(
          Array.from({ length: 4 }, () =>
            createPlayerApiContext(playwright, fixture.session)
          )
        )
        targetPlayerId = (
          await claimPlayer(playerSessions[0]!, gameId, "Alice")
        ).playerId
        await claimPlayer(playerSessions[1]!, gameId, "Bob")
        await claimPlayer(playerSessions[2]!, gameId, "Cara")
        await claimPlayer(playerSessions[3]!, gameId, "Dan")
        approvalsKey = redisKeys.removePlayerVoteApprovals(
          gameId,
          targetPlayerId
        )
        expect(
          (
            await playerSessions[1]!.post(
              removeVotePath(gameId, targetPlayerId)
            )
          ).status()
        ).toBe(200)
        redis = createTestRedisClient()
        await redis.del(approvalsKey)
        await redis.set(approvalsKey, TEST_FIXTURES.redis.wrongTypeValue)
        scenario = await captureResponse(
          await playerSessions[2]!.post(removeVotePath(gameId, targetPlayerId))
        )
      })

      test.afterEach(async () => {
        await redis.quit()
        await Promise.all(
          playerSessions.map((playerSession) => playerSession.dispose())
        )
        await roomSession?.dispose()
      })

      test("does not add an approval to malformed vote state", async () => {
        expect(scenario.status).toBe(500)
        expect(scenario.body).toMatchObject({
          error: ApiErrorCode.INTERNAL_SERVER_ERROR,
        })
        expect(
          await redis.hgetall(
            redisKeys.removePlayerVote(gameId, targetPlayerId)
          )
        ).toEqual({ target_player_id: targetPlayerId })
        expect(await redis.get(approvalsKey)).toBe(
          TEST_FIXTURES.redis.wrongTypeValue
        )
      })
    })
  })

  test.describe("DELETE /api/v1/games/:gameId/players/:playerId/remove-vote", () => {
    test.describe("when the caller withdraws their removal vote", () => {
      let session: APIRequestContext | undefined
      let playerSessions: APIRequestContext[] = []
      let gameId: string
      let targetPlayerId: string
      let scenario: { status: number; body: unknown }

      test.beforeEach(async ({ playwright }) => {
        const fixture = await createGameSession(
          playwright,
          GAME_WITH_FOUR_PLAYERS
        )
        gameId = fixture.gameId
        session = fixture.session
        playerSessions = await Promise.all(
          Array.from({ length: 4 }, () =>
            createPlayerApiContext(playwright, fixture.session)
          )
        )
        targetPlayerId = (
          await claimPlayer(playerSessions[0]!, gameId, "Alice")
        ).playerId
        await claimPlayer(playerSessions[1]!, gameId, "Bob")
        await claimPlayer(playerSessions[2]!, gameId, "Cara")
        await claimPlayer(playerSessions[3]!, gameId, "Dan")
        await playerSessions[1]!.post(removeVotePath(gameId, targetPlayerId))
        const response = await playerSessions[1]!.delete(
          removeVotePath(gameId, targetPlayerId)
        )
        scenario = await captureResponse(response)
      })

      test.afterEach(async () => {
        await Promise.all(
          playerSessions.map((playerSession) => playerSession.dispose())
        )
        await session?.dispose()
      })

      test("clears the pending request when its only vote is withdrawn", () => {
        expect(scenario.status).toBe(200)
        expect(scenario.body).toMatchObject({
          pending: false,
        })
      })

      test.describe("when the pending vote approvals key has the wrong Redis type", () => {
        let session: APIRequestContext | undefined
        let playerSessions: APIRequestContext[] = []
        let redis: ReturnType<typeof createTestRedisClient>
        let gameId: string
        let targetPlayerId: string
        let voteKey: string
        let approvalsKey: string
        let scenario: { status: number; body: unknown }

        test.beforeEach(async ({ playwright }) => {
          const fixture = await createGameSession(
            playwright,
            GAME_WITH_FOUR_PLAYERS
          )
          gameId = fixture.gameId
          session = fixture.session
          playerSessions = await Promise.all(
            Array.from({ length: 4 }, () =>
              createPlayerApiContext(playwright, fixture.session)
            )
          )
          targetPlayerId = (
            await claimPlayer(playerSessions[0]!, gameId, "Alice")
          ).playerId
          await claimPlayer(playerSessions[1]!, gameId, "Bob")
          await claimPlayer(playerSessions[2]!, gameId, "Cara")
          await claimPlayer(playerSessions[3]!, gameId, "Dan")
          voteKey = redisKeys.removePlayerVote(gameId, targetPlayerId)
          approvalsKey = redisKeys.removePlayerVoteApprovals(
            gameId,
            targetPlayerId
          )
          expect(
            (
              await playerSessions[1]!.post(
                removeVotePath(gameId, targetPlayerId)
              )
            ).status()
          ).toBe(200)
          redis = createTestRedisClient()
          await redis.del(approvalsKey)
          await redis.set(approvalsKey, TEST_FIXTURES.redis.wrongTypeValue)
          scenario = await captureResponse(
            await playerSessions[1]!.delete(
              removeVotePath(gameId, targetPlayerId)
            )
          )
        })

        test.afterEach(async () => {
          await redis.quit()
          await Promise.all(
            playerSessions.map((playerSession) => playerSession.dispose())
          )
          await session?.dispose()
        })

        test("keeps the pending vote unchanged", async () => {
          expect(scenario.status).toBe(500)
          expect(scenario.body).toMatchObject({
            error: ApiErrorCode.INTERNAL_SERVER_ERROR,
          })
          expect(await redis.hgetall(voteKey)).toEqual({
            target_player_id: targetPlayerId,
          })
          expect(await redis.get(approvalsKey)).toBe(
            TEST_FIXTURES.redis.wrongTypeValue
          )
        })
      })
    })
  })
})
