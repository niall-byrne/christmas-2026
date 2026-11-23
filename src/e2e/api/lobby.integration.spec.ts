import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { createPlayerApiContext } from "@/e2e/resources/api"
import { createGameSession, readGame } from "@/e2e/resources/games"
import { claimPlayer } from "@/e2e/resources/players"
import {
  createTestRedisClient,
  subscribeToGameStateEvents,
} from "@/e2e/resources/redis"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"
import { createTeam } from "@/e2e/resources/teams"
import { redisKeys } from "@/game/api/redis/redisKeys"

const GAME_WITH_FOUR_PLAYERS = {
  ...TEST_FIXTURES.game,
  cards: [
    ...TEST_FIXTURES.game.cards,
    { recipient: "Cara", identifier: "card-cara" },
    { recipient: "Dan", identifier: "card-dan" },
  ],
}

const GAME_WITH_THREE_PLAYERS = {
  ...TEST_FIXTURES.game,
  cards: [
    ...TEST_FIXTURES.game.cards,
    { recipient: "Cara", identifier: "card-cara" },
  ],
}

function playerPath(gameId: string) {
  return `/api/v1/games/${gameId}/players`
}

function readyPath(gameId: string) {
  return `${playerPath(gameId)}/ready`
}

function teamPath(gameId: string, teamId: string) {
  return `/api/v1/games/${gameId}/teams/${teamId}`
}

function teamPlayersPath(gameId: string, teamId: string) {
  return `${teamPath(gameId, teamId)}/players`
}

function removeVotePath(gameId: string, playerId: string) {
  return `${playerPath(gameId)}/${playerId}/remove-vote`
}

test.describe("Lobby integration", () => {
  const sessions: APIRequestContext[] = []
  const redisClients: ReturnType<typeof createTestRedisClient>[] = []

  function track(session: APIRequestContext) {
    sessions.push(session)
    return session
  }

  function createTrackedRedisClient() {
    const client = createTestRedisClient()
    redisClients.push(client)
    return client
  }

  async function createPlayerSessions(
    playwright: Parameters<typeof createGameSession>[0],
    roomSession: APIRequestContext,
    count: number
  ) {
    return Promise.all(
      Array.from({ length: count }, () =>
        createPlayerApiContext(playwright, roomSession).then(track)
      )
    )
  }

  async function claimPlayers(
    playerSessions: APIRequestContext[],
    gameId: string,
    names: string[]
  ) {
    return Promise.all(
      names.map((name, index) =>
        claimPlayer(playerSessions[index]!, gameId, name)
      )
    )
  }

  async function createFourPlayerVoteScenario(
    playwright: Parameters<typeof createGameSession>[0]
  ) {
    const fixture = await createGameSession(playwright, GAME_WITH_FOUR_PLAYERS)
    const gameId = fixture.gameId
    const roomSession = track(fixture.session)
    const [targetSession, callerSession, anotherSession, fourthSession] =
      await createPlayerSessions(playwright, roomSession, 4)
    const [target, , another] = await claimPlayers(
      [targetSession!, callerSession!, anotherSession!, fourthSession!],
      gameId,
      ["Alice", "Bob", "Cara", "Dan"]
    )

    return {
      gameId,
      roomSession,
      targetSession: targetSession!,
      callerSession: callerSession!,
      anotherSession: anotherSession!,
      fourthSession: fourthSession!,
      targetPlayerId: target!.playerId,
      anotherPlayerId: another!.playerId,
    }
  }

  test.afterEach(async () => {
    await Promise.all([
      ...sessions.splice(0).map((session) => session.dispose()),
      ...redisClients.splice(0).map((client) => client.quit()),
    ])
  })

  test.describe("When a team is full", () => {
    let gameId: string
    let roomSession: APIRequestContext
    let thirdPlayerSession: APIRequestContext
    let firstTeamId: string
    let secondTeamId: string
    let firstPlayerId: string
    let revisionBeforeAssignment: number

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(
        playwright,
        GAME_WITH_THREE_PLAYERS
      )
      gameId = fixture.gameId
      roomSession = track(fixture.session)
      const [firstPlayerSession, secondPlayerSession, thirdSession] =
        await createPlayerSessions(playwright, roomSession, 3)
      thirdPlayerSession = thirdSession!

      firstTeamId = (await createTeam(roomSession, gameId)).teamId
      const secondTeam = await roomSession.post(
        `/api/v1/games/${gameId}/teams`,
        { data: { name: "Team Two", color: "#123456" } }
      )
      expect(secondTeam.status()).toBe(201)
      secondTeamId = (await secondTeam.json()).teamId

      firstPlayerId = (await claimPlayer(firstPlayerSession!, gameId, "Alice"))
        .playerId
      await claimPlayer(secondPlayerSession!, gameId, "Bob")
      await claimPlayer(thirdPlayerSession, gameId, "Cara")
      expect(
        (
          await firstPlayerSession!.post(teamPlayersPath(gameId, firstTeamId))
        ).status()
      ).toBe(200)
      expect(
        (
          await secondPlayerSession!.post(teamPlayersPath(gameId, firstTeamId))
        ).status()
      ).toBe(200)
      revisionBeforeAssignment = (await readGame(roomSession, gameId)).revision
    })

    test("rejects a third player without changing the lobby state", async () => {
      const response = await thirdPlayerSession.post(
        teamPlayersPath(gameId, firstTeamId)
      )

      expect(response.status()).toBe(422)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.TEAM_FULL,
      })
      const game = await readGame(roomSession, gameId)
      expect(game.revision).toBe(revisionBeforeAssignment)
      expect(
        game.teams.find(
          ({ teamId }: { teamId: string }) => teamId === firstTeamId
        )?.players
      ).toEqual(
        expect.arrayContaining([
          { playerId: firstPlayerId, name: "Alice", ready: false },
          expect.objectContaining({ name: "Bob" }),
        ])
      )
      expect(
        game.teams.find(
          ({ teamId }: { teamId: string }) => teamId === secondTeamId
        )?.players
      ).toEqual([])
      expect(game.unassignedPlayers).toEqual([
        expect.objectContaining({ name: "Cara" }),
      ])
    })
  })

  test.describe("When a player switches teams", () => {
    let gameId: string
    let roomSession: APIRequestContext
    let playerSession: APIRequestContext
    let playerId: string
    let firstTeamId: string
    let secondTeamId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      roomSession = track(fixture.session)
      ;[playerSession] = await createPlayerSessions(playwright, roomSession, 1)
      firstTeamId = (await createTeam(roomSession, gameId)).teamId
      const secondTeam = await roomSession.post(
        `/api/v1/games/${gameId}/teams`,
        { data: { name: "Team Two", color: "#123456" } }
      )
      expect(secondTeam.status()).toBe(201)
      secondTeamId = (await secondTeam.json()).teamId
      playerId = (await claimPlayer(playerSession!, gameId, "Alice")).playerId
      expect(
        (
          await playerSession!.post(teamPlayersPath(gameId, firstTeamId))
        ).status()
      ).toBe(200)
      expect((await playerSession!.post(readyPath(gameId))).status()).toBe(200)
    })

    test("moves the player and resets readiness", async () => {
      const revisionBeforeSwitch = (await readGame(roomSession, gameId))
        .revision

      const assignment = await playerSession!.post(
        teamPlayersPath(gameId, secondTeamId)
      )

      expect(assignment.status()).toBe(200)
      expect(await assignment.json()).toMatchObject({
        playerId,
        teamId: secondTeamId,
        ready: false,
      })
      const state = await readGame(roomSession, gameId)
      expect(state.revision).toBe(revisionBeforeSwitch + 1)
      expect(
        state.teams.find(
          ({ teamId }: { teamId: string }) => teamId === firstTeamId
        )?.players
      ).toEqual([])
      expect(
        state.teams.find(
          ({ teamId }: { teamId: string }) => teamId === secondTeamId
        )?.players
      ).toEqual([expect.objectContaining({ playerId, ready: false })])
    })
  })

  test.describe("When an unassigned player uses team-only operations", () => {
    let gameId: string
    let session: APIRequestContext
    let otherTeamId: string
    let revisionBeforeOperations: number

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      session = track(fixture.session)
      otherTeamId = (await createTeam(session, gameId)).teamId
      const claim = await session.post(playerPath(gameId), {
        data: TEST_FIXTURES.player,
      })
      expect(claim.status()).toBe(201)
      revisionBeforeOperations = (await readGame(session, gameId)).revision
    })

    test("cannot mark themself ready", async () => {
      const response = await session.post(readyPath(gameId))

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.PLAYER_NOT_ASSIGNED,
      })
      expect((await readGame(session, gameId)).revision).toBe(
        revisionBeforeOperations
      )
    })

    test("cannot leave a team they do not belong to", async () => {
      const response = await session.delete(
        teamPlayersPath(gameId, otherTeamId)
      )

      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({ teamId: null })
      expect(await readGame(session, gameId)).toMatchObject({
        revision: revisionBeforeOperations,
        unassignedPlayers: [{ name: TEST_FIXTURES.player.name }],
      })
    })
  })

  test.describe("When a player leaves their team", () => {
    let gameId: string
    let session: APIRequestContext
    let teamId: string
    let playerId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      session = track(fixture.session)
      teamId = (await createTeam(session, gameId)).teamId
      playerId = (await claimPlayer(session, gameId)).playerId
      expect(
        (await session.post(teamPlayersPath(gameId, teamId))).status()
      ).toBe(200)
      expect((await session.post(readyPath(gameId))).status()).toBe(200)
    })

    test("unassigns the player and preserves the name claim", async () => {
      const revisionBeforeLeave = (await readGame(session, gameId)).revision

      const response = await session.delete(teamPlayersPath(gameId, teamId))

      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({
        playerId,
        teamId: null,
        ready: false,
      })
      const state = await readGame(session, gameId)
      expect(state.revision).toBe(revisionBeforeLeave + 1)
      expect(state.teams).toMatchObject([{ teamId, players: [] }])
      expect(state.unassignedPlayers).toEqual([
        {
          playerId,
          name: TEST_FIXTURES.player.name,
          ready: false,
        },
      ])
    })
  })

  test.describe("When a team with ready players is deleted", () => {
    let gameId: string
    let session: APIRequestContext
    let teamId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      session = track(fixture.session)
      const [firstPlayerSession, secondPlayerSession] =
        await createPlayerSessions(playwright, session, 2)
      teamId = (await createTeam(session, gameId)).teamId

      await claimPlayers([firstPlayerSession!, secondPlayerSession!], gameId, [
        "Alice",
        "Bob",
      ])
      for (const playerSession of [firstPlayerSession!, secondPlayerSession!]) {
        expect(
          (await playerSession.post(teamPlayersPath(gameId, teamId))).status()
        ).toBe(200)
        expect((await playerSession.post(readyPath(gameId))).status()).toBe(200)
      }
    })

    test("returns the players to the lobby unassigned and not ready", async () => {
      const response = await session.delete(teamPath(gameId, teamId))

      expect(response.status()).toBe(200)
      const game = await readGame(session, gameId)
      expect(game.teams).toEqual([])
      expect(game.unassignedPlayers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Alice", ready: false }),
          expect.objectContaining({ name: "Bob", ready: false }),
        ])
      )
    })
  })
  test.describe("When an approval is submitted for a removal vote", () => {
    let scenario: Awaited<ReturnType<typeof createFourPlayerVoteScenario>>

    test.beforeEach(async ({ playwright }) => {
      scenario = await createFourPlayerVoteScenario(playwright)
    })

    test("counts the caller's repeated approval only once", async () => {
      const { callerSession, gameId, targetPlayerId } = scenario
      const path = removeVotePath(gameId, targetPlayerId)
      const firstApproval = await callerSession.post(path)
      expect(firstApproval.status()).toBe(200)
      expect(await firstApproval.json()).toMatchObject({
        approvals: 1,
        requiredApprovals: 3,
        pending: true,
      })

      const repeatedApproval = await callerSession.post(path)
      expect(repeatedApproval.status()).toBe(200)
      expect(await repeatedApproval.json()).toMatchObject({
        approvals: 1,
        requiredApprovals: 3,
        pending: true,
      })
    })
  })

  test.describe("When an approved removal vote is pending", () => {
    let scenario: Awaited<ReturnType<typeof createFourPlayerVoteScenario>>

    test.beforeEach(async ({ playwright }) => {
      scenario = await createFourPlayerVoteScenario(playwright)
      const { callerSession, gameId, targetPlayerId } = scenario
      const response = await callerSession.post(
        removeVotePath(gameId, targetPlayerId)
      )
      expect(response.status()).toBe(200)
    })

    test("expires approvals after five minutes", async () => {
      const { gameId, targetPlayerId } = scenario
      const redis = createTrackedRedisClient()
      const voteTtl = await redis.ttl(
        redisKeys.removePlayerVote(gameId, targetPlayerId)
      )
      const approvalsTtl = await redis.ttl(
        redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId)
      )
      expect(voteTtl).toBeGreaterThan(0)
      expect(voteTtl).toBeLessThanOrEqual(300)
      expect(approvalsTtl).toBeGreaterThan(0)
      expect(approvalsTtl).toBeLessThanOrEqual(300)
    })

    test("refreshes the vote expiry when another player approves", async () => {
      const { anotherSession, gameId, targetPlayerId } = scenario
      const path = removeVotePath(gameId, targetPlayerId)
      const redis = createTrackedRedisClient()
      await redis.expire(
        redisKeys.removePlayerVote(gameId, targetPlayerId),
        100
      )
      await redis.expire(
        redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId),
        100
      )

      const approval = await anotherSession.post(path)
      expect(approval.status()).toBe(200)
      expect(
        await redis.ttl(redisKeys.removePlayerVote(gameId, targetPlayerId))
      ).toBeGreaterThan(200)
      expect(
        await redis.ttl(
          redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId)
        )
      ).toBeGreaterThan(200)
    })

    test("allows a new vote after the previous vote expires", async () => {
      const { anotherSession, gameId, targetPlayerId } = scenario
      const path = removeVotePath(gameId, targetPlayerId)
      const redis = createTrackedRedisClient()
      await redis.expire(redisKeys.removePlayerVote(gameId, targetPlayerId), 1)
      await redis.expire(
        redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId),
        1
      )
      await expect
        .poll(() =>
          redis.exists(redisKeys.removePlayerVote(gameId, targetPlayerId))
        )
        .toBe(0)
      expect(
        await redis.exists(
          redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId)
        )
      ).toBe(0)
      const retry = await anotherSession.post(path)
      expect(retry.status()).toBe(200)
      expect(await retry.json()).toMatchObject({
        targetPlayerId,
        approvals: 1,
        requiredApprovals: 3,
        pending: true,
      })
    })
  })

  test.describe("When an approval is cancelled", () => {
    let scenario: Awaited<ReturnType<typeof createFourPlayerVoteScenario>>

    test.beforeEach(async ({ playwright }) => {
      scenario = await createFourPlayerVoteScenario(playwright)
      const { callerSession, anotherSession, gameId, targetPlayerId } = scenario
      const path = removeVotePath(gameId, targetPlayerId)
      expect((await callerSession.post(path)).status()).toBe(200)
      expect((await anotherSession.post(path)).status()).toBe(200)
    })

    test("removes only the caller's approval", async () => {
      const { callerSession, fourthSession, gameId, targetPlayerId } = scenario
      const path = removeVotePath(gameId, targetPlayerId)
      const cancellation = await callerSession.delete(path)
      expect(cancellation.status()).toBe(200)
      expect(await cancellation.json()).toMatchObject({ pending: true })

      const nextApproval = await fourthSession.post(path)
      expect(nextApproval.status()).toBe(200)
      expect(await nextApproval.json()).toMatchObject({
        approvals: 2,
        requiredApprovals: 3,
        pending: true,
      })
    })
  })

  test.describe("When cancelling a removal vote with no approvals", () => {
    let scenario: Awaited<ReturnType<typeof createFourPlayerVoteScenario>>

    test.beforeEach(async ({ playwright }) => {
      scenario = await createFourPlayerVoteScenario(playwright)
    })

    test("leaves the vote absent", async () => {
      const { callerSession, gameId, targetPlayerId } = scenario
      const response = await callerSession.delete(
        removeVotePath(gameId, targetPlayerId)
      )

      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({
        targetPlayerId,
        pending: false,
      })
    })
  })

  test.describe("When a removal vote targets an invalid player", () => {
    let scenario: Awaited<ReturnType<typeof createFourPlayerVoteScenario>>

    test.beforeEach(async ({ playwright }) => {
      scenario = await createFourPlayerVoteScenario(playwright)
    })

    test("does not allow a player to approve their own removal", async () => {
      const { targetSession, gameId, targetPlayerId } = scenario
      const response = await targetSession.post(
        removeVotePath(gameId, targetPlayerId)
      )

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.CANNOT_REMOVE_SELF,
      })
    })

    test("returns player not found for a missing target", async () => {
      const { callerSession, gameId, roomSession } = scenario
      const before = await readGame(roomSession, gameId)

      const response = await callerSession.post(
        removeVotePath(gameId, "000000000000000000000000")
      )

      expect(response.status()).toBe(404)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.PLAYER_NOT_FOUND,
      })
      expect(await readGame(roomSession, gameId)).toEqual(before)
    })
  })

  test.describe("When a voter leaves during another player's removal vote", () => {
    let scenario: Awaited<ReturnType<typeof createFourPlayerVoteScenario>>

    test.beforeEach(async ({ playwright }) => {
      scenario = await createFourPlayerVoteScenario(playwright)
      const { callerSession, anotherSession, gameId, targetPlayerId } = scenario
      const path = removeVotePath(gameId, targetPlayerId)
      expect((await callerSession.post(path)).status()).toBe(200)
      expect((await anotherSession.post(path)).status()).toBe(200)
    })

    test("removes the departed player's approval from the pending vote", async () => {
      const {
        callerSession,
        anotherSession,
        fourthSession,
        gameId,
        targetPlayerId,
        anotherPlayerId,
      } = scenario
      const redis = createTrackedRedisClient()
      const path = removeVotePath(gameId, targetPlayerId)

      const departure = await callerSession.delete(playerPath(gameId))
      expect(departure.status()).toBe(200)
      expect(
        await redis.smembers(
          redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId)
        )
      ).toEqual([anotherPlayerId])

      const updatedApproval = await anotherSession.post(path)
      expect(updatedApproval.status()).toBe(200)
      expect(await updatedApproval.json()).toMatchObject({
        approvals: 1,
        requiredApprovals: 2,
        pending: true,
      })

      const finalApproval = await fourthSession.post(path)
      expect(finalApproval.status()).toBe(200)
      expect(await finalApproval.json()).toMatchObject({
        targetPlayerId,
        approvals: 0,
        requiredApprovals: 0,
        pending: false,
        removed: true,
      })
    })
  })

  test.describe("When a new player joins during a pending removal vote", () => {
    let gameId: string
    let roomSession: APIRequestContext
    let playerSessions: APIRequestContext[]
    let targetPlayerId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(
        playwright,
        GAME_WITH_FOUR_PLAYERS
      )
      gameId = fixture.gameId
      roomSession = track(fixture.session)
      playerSessions = await createPlayerSessions(playwright, roomSession, 3)
      targetPlayerId = (await claimPlayer(playerSessions[0]!, gameId, "Alice"))
        .playerId
      await claimPlayer(playerSessions[1]!, gameId, "Bob")
      await claimPlayer(playerSessions[2]!, gameId, "Cara")
    })

    test("requires the new player to approve before removal", async ({
      playwright,
    }) => {
      const path = removeVotePath(gameId, targetPlayerId)
      const firstApproval = await playerSessions[1]!.post(path)
      expect(firstApproval.status()).toBe(200)
      expect(await firstApproval.json()).toMatchObject({
        approvals: 1,
        requiredApprovals: 2,
      })

      const newPlayerSession = track(
        await createPlayerApiContext(playwright, roomSession)
      )
      await claimPlayer(newPlayerSession, gameId, "Dan")

      const secondApproval = await playerSessions[2]!.post(path)
      expect(secondApproval.status()).toBe(200)
      expect(await secondApproval.json()).toMatchObject({
        approvals: 2,
        requiredApprovals: 3,
        pending: true,
      })

      const finalApproval = await newPlayerSession.post(path)
      expect(finalApproval.status()).toBe(200)
      expect(await finalApproval.json()).toMatchObject({
        targetPlayerId,
        approvals: 0,
        requiredApprovals: 0,
        pending: false,
        removed: true,
      })
    })
  })

  test.describe("When only one other player must approve a removal vote", () => {
    let gameId: string
    let roomSession: APIRequestContext
    let targetSession: APIRequestContext
    let approverSession: APIRequestContext
    let targetPlayerId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      roomSession = track(fixture.session)
      ;[targetSession, approverSession] = await createPlayerSessions(
        playwright,
        roomSession,
        2
      )
      targetPlayerId = (await claimPlayer(targetSession!, gameId, "Alice"))
        .playerId
      await claimPlayer(approverSession!, gameId, "Bob")
    })

    test("removes the target immediately and releases their name", async ({
      playwright,
    }) => {
      const response = await approverSession!.post(
        removeVotePath(gameId, targetPlayerId)
      )

      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({
        targetPlayerId,
        approvals: 0,
        requiredApprovals: 0,
        pending: false,
        removed: true,
      })
      expect(await readGame(roomSession, gameId)).toMatchObject({
        unassignedPlayers: [{ name: "Bob" }],
      })
      const staleTargetRequest = await targetSession!.post(readyPath(gameId))
      expect(staleTargetRequest.status()).toBe(401)
      expect(await staleTargetRequest.json()).toMatchObject({
        error: ApiErrorCode.UNAUTHORIZED,
      })

      const replacementSession = track(
        await createPlayerApiContext(playwright, roomSession)
      )
      const reclaimedName = await replacementSession.post(playerPath(gameId), {
        data: { name: "Alice" },
      })
      expect(reclaimedName.status()).toBe(201)
    })
  })

  test.describe("When a game starts with an existing team", () => {
    let gameId: string
    let roomSession: APIRequestContext
    let existingTeamId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      roomSession = track(fixture.session)
      existingTeamId = (await createTeam(roomSession, gameId)).teamId
      const start = await roomSession.patch(`/api/v1/games/${gameId}`, {
        data: { level: 1 },
      })
      expect(start.status()).toBe(200)
    })

    test("rejects team creation", async () => {
      const response = await roomSession.post(`/api/v1/games/${gameId}/teams`, {
        data: { name: "Team Three", color: "#654321" },
      })

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.GAME_NOT_IN_LOBBY,
      })
    })

    test("rejects team deletion", async () => {
      const response = await roomSession.delete(
        teamPath(gameId, existingTeamId)
      )

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.GAME_NOT_IN_LOBBY,
      })
    })
  })

  test.describe("When a game starts with an assigned player", () => {
    let gameId: string
    let roomSession: APIRequestContext
    let playerSession: APIRequestContext
    let existingTeamId: string
    let destinationTeamId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      roomSession = track(fixture.session)
      playerSession = track(
        await createPlayerApiContext(playwright, roomSession)
      )
      existingTeamId = (await createTeam(roomSession, gameId)).teamId
      const destinationResponse = await roomSession.post(
        `/api/v1/games/${gameId}/teams`,
        { data: { name: "Team Two", color: "#123456" } }
      )
      expect(destinationResponse.status()).toBe(201)
      destinationTeamId = (await destinationResponse.json()).teamId
      await claimPlayer(playerSession, gameId, "Alice")
      expect(
        (
          await playerSession.post(teamPlayersPath(gameId, existingTeamId))
        ).status()
      ).toBe(200)
      expect((await playerSession.post(readyPath(gameId))).status()).toBe(200)
      const start = await roomSession.patch(`/api/v1/games/${gameId}`, {
        data: { level: 1 },
      })
      expect(start.status()).toBe(200)
    })

    test("rejects assigning the player to another team", async () => {
      const response = await playerSession.post(
        teamPlayersPath(gameId, destinationTeamId)
      )

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.GAME_NOT_IN_LOBBY,
      })
    })

    test("rejects leaving the current team", async () => {
      const response = await playerSession.delete(
        teamPlayersPath(gameId, existingTeamId)
      )

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.GAME_NOT_IN_LOBBY,
      })
    })

    test("rejects changing the player's readiness", async () => {
      const response = await playerSession.delete(readyPath(gameId))

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.GAME_NOT_IN_LOBBY,
      })
    })

    test("allows self-removal and revokes player identity after the game starts", async () => {
      const response = await playerSession.delete(playerPath(gameId))

      expect(response.status()).toBe(200)
      expect(response.headers()["set-cookie"]).toContain(
        `game_player_${gameId}=`
      )
      expect(response.headers()["set-cookie"]).toContain("Max-Age=0")
      expect(await readGame(roomSession, gameId)).toMatchObject({
        level: 1,
        unassignedPlayers: [],
        teams: expect.arrayContaining([
          expect.objectContaining({ teamId: existingTeamId, players: [] }),
        ]),
      })

      const staleIdentityRequest = await playerSession.post(readyPath(gameId))
      expect(staleIdentityRequest.status()).toBe(401)
      expect(await staleIdentityRequest.json()).toMatchObject({
        error: ApiErrorCode.UNAUTHORIZED,
      })
    })
  })

  test.describe("When a game starts with a pending removal vote", () => {
    let gameId: string
    let roomSession: APIRequestContext
    let callerSession: APIRequestContext
    let targetPlayerId: string

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      roomSession = track(fixture.session)
      const [targetSession, caller] = await createPlayerSessions(
        playwright,
        roomSession,
        2
      )
      callerSession = caller!
      targetPlayerId = (await claimPlayer(targetSession!, gameId, "Alice"))
        .playerId
      await claimPlayer(callerSession, gameId, "Bob")
      expect(
        (
          await callerSession.post(removeVotePath(gameId, targetPlayerId))
        ).status()
      ).toBe(200)
      const start = await roomSession.patch(`/api/v1/games/${gameId}`, {
        data: { level: 1 },
      })
      expect(start.status()).toBe(200)
    })

    test("rejects new removal approvals", async () => {
      const response = await callerSession.post(
        removeVotePath(gameId, targetPlayerId)
      )

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.GAME_NOT_IN_LOBBY,
      })
    })

    test("rejects removal approval cancellation", async () => {
      const response = await callerSession.delete(
        removeVotePath(gameId, targetPlayerId)
      )

      expect(response.status()).toBe(409)
      expect(await response.json()).toMatchObject({
        error: ApiErrorCode.GAME_NOT_IN_LOBBY,
      })
    })

    test("clears pending votes when the game leaves the lobby", async () => {
      const redis = createTrackedRedisClient()
      const voteExists = await redis.exists(
        redisKeys.removePlayerVote(gameId, targetPlayerId)
      )
      const approvalsExist = await redis.exists(
        redisKeys.removePlayerVoteApprovals(gameId, targetPlayerId)
      )
      expect(voteExists).toBe(0)
      expect(approvalsExist).toBe(0)
    })
  })

  test.describe("Idempotent readiness updates", () => {
    let gameId: string
    let session: APIRequestContext
    let eventSubscription:
      Awaited<ReturnType<typeof subscribeToGameStateEvents>> | undefined

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      session = track(fixture.session)
      const teamId = (await createTeam(session, gameId)).teamId
      await claimPlayer(session, gameId)
      expect(
        (await session.post(teamPlayersPath(gameId, teamId))).status()
      ).toBe(200)
    })

    test.afterEach(async () => {
      await eventSubscription?.close()
      eventSubscription = undefined
    })

    test("does not publish a repeated not-ready update", async () => {
      eventSubscription = await subscribeToGameStateEvents(gameId)
      const before = await readGame(session, gameId)

      const response = await session.delete(readyPath(gameId))

      expect(response.status()).toBe(200)
      expect(await readGame(session, gameId)).toEqual(before)
      expect(await eventSubscription.hasMessageAfterPing()).toBe(false)
    })

    test("does not publish a repeated ready update", async () => {
      expect((await session.post(readyPath(gameId))).status()).toBe(200)
      const before = await readGame(session, gameId)
      eventSubscription = await subscribeToGameStateEvents(gameId)

      const response = await session.post(readyPath(gameId))

      expect(response.status()).toBe(200)
      expect(await readGame(session, gameId)).toEqual(before)
      expect(await eventSubscription.hasMessageAfterPing()).toBe(false)
    })
  })

  test.describe("Self-removing from a team", () => {
    let gameId: string
    let session: APIRequestContext
    let teamId: string
    let playerId: string
    let revisionBeforeRemoval: number

    test.beforeEach(async ({ playwright }) => {
      const fixture = await createGameSession(playwright)
      gameId = fixture.gameId
      session = track(fixture.session)
      teamId = (await createTeam(session, gameId)).teamId
      playerId = (await claimPlayer(session, gameId)).playerId
      expect(
        (await session.post(teamPlayersPath(gameId, teamId))).status()
      ).toBe(200)
      revisionBeforeRemoval = (await readGame(session, gameId)).revision
    })

    test("removes the player and invalidates their identity", async () => {
      const response = await session.delete(playerPath(gameId))

      expect(response.status()).toBe(200)
      expect(response.headers()["set-cookie"]).toContain("Max-Age=0")
      const state = await readGame(session, gameId)
      expect(state.revision).toBe(revisionBeforeRemoval + 1)
      expect(state.teams).toMatchObject([{ teamId, players: [] }])
      expect(state.unassignedPlayers).toEqual([])

      const staleIdentityRequest = await session.post(readyPath(gameId))
      expect(staleIdentityRequest.status()).toBe(401)

      const replacement = await session.post(playerPath(gameId), {
        data: { name: TEST_FIXTURES.player.name },
      })
      expect(replacement.status()).toBe(201)
      expect((await replacement.json()).playerId).not.toBe(playerId)
    })
  })
})
