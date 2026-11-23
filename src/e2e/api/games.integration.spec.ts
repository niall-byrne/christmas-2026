import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import { ApiErrorCode } from "@/contracts/game/api/data"
import { createApiContext, createPlayerApiContext } from "@/e2e/resources/api"
import { createGame, readGame } from "@/e2e/resources/games"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"

test.describe("Full game lifecycle", () => {
  let scenario: {
    creator: APIRequestContext
    session: APIRequestContext
    additionalSessions: APIRequestContext[]
  }

  test.beforeEach(async ({ playwright }) => {
    scenario = {
      creator: await createApiContext(playwright),
      session: await createApiContext(playwright),
      additionalSessions: [],
    }
  })

  test.afterEach(async () => {
    await Promise.all(
      scenario.additionalSessions.map((session) => session.dispose())
    )
    await scenario.creator.dispose()
    await scenario.session.dispose()
  })

  test("persists each operation to the game state", async () => {
    const { creator, session } = scenario
    const { gameId } = await test.step("Create a game", () =>
      createGame(creator))

    await test.step("Join the game with its password", async () => {
      const response = await session.post(`/api/v1/games/${gameId}/join`, {
        data: { password: TEST_FIXTURES.game.password },
      })
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        gameId,
      })
    })

    await test.step("Rename the game and verify the saved state", async () => {
      const response = await session.patch(`/api/v1/games/${gameId}`, {
        data: { name: "Integrated Playwright game" },
      })
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        name: "Integrated Playwright game",
      })
    })

    const { teamId } =
      await test.step("Create a team and verify the saved state", async () => {
        const response = await session.post(`/api/v1/games/${gameId}/teams`, {
          data: TEST_FIXTURES.team,
        })
        expect(response.status()).toBe(201)
        const team = (await response.json()) as { teamId: string }
        await expect(readGame(session, gameId)).resolves.toMatchObject({
          teams: [{ teamId: team.teamId, score: 0, players: [] }],
        })
        return team
      })

    const { playerId } =
      await test.step("Claim and assign a player", async () => {
        const response = await session.post(`/api/v1/games/${gameId}/players`, {
          data: TEST_FIXTURES.player,
        })
        expect(response.status()).toBe(201)
        const player = (await response.json()) as { playerId: string }
        const assignment = await session.post(
          `/api/v1/games/${gameId}/teams/${teamId}/players`
        )
        expect(assignment.status()).toBe(200)
        await expect(readGame(session, gameId)).resolves.toMatchObject({
          teams: [
            {
              teamId,
              players: [{ playerId: player.playerId, ready: false }],
            },
          ],
        })
        return player
      })

    await test.step("Mark the player ready and verify the saved state", async () => {
      const response = await session.post(
        `/api/v1/games/${gameId}/players/ready`
      )
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        teams: [{ teamId, players: [{ playerId, ready: true }] }],
      })
    })

    await test.step("Mark the player not ready and verify the saved state", async () => {
      const response = await session.delete(
        `/api/v1/games/${gameId}/players/ready`
      )
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        teams: [{ teamId, players: [{ playerId, ready: false }] }],
      })
    })

    await test.step("Update the team score and verify the saved state", async () => {
      const response = await session.patch(
        `/api/v1/games/${gameId}/teams/${teamId}/score`,
        { data: { delta: 7 } }
      )
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        teams: [{ teamId, score: 7 }],
      })
    })

    await test.step("Leave the team and verify the saved state", async () => {
      const response = await session.delete(
        `/api/v1/games/${gameId}/teams/${teamId}/players`
      )
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        gameId,
        name: "Integrated Playwright game",
        teams: [{ teamId, score: 7, players: [] }],
        unassignedPlayers: [
          { playerId, name: TEST_FIXTURES.player.name, ready: false },
        ],
      })
    })
  })

  test("deletes a team and returns its players to the lobby unassigned", async ({
    playwright,
  }) => {
    const { creator, session, additionalSessions } = scenario
    const { gameId } = await createGame(creator)
    const joinResponse = await session.post(`/api/v1/games/${gameId}/join`, {
      data: { password: TEST_FIXTURES.game.password },
    })
    expect(joinResponse.status()).toBe(200)
    const secondPlayerSession = await createPlayerApiContext(
      playwright,
      session
    )
    additionalSessions.push(secondPlayerSession)
    const { teamId } = await test.step("Create a team", async () => {
      const response = await session.post(`/api/v1/games/${gameId}/teams`, {
        data: TEST_FIXTURES.team,
      })
      expect(response.status()).toBe(201)
      return response.json() as Promise<{ teamId: string }>
    })

    await test.step("Claim, assign, and ready two players", async () => {
      for (const [playerSession, name] of [
        [session, "Alice"],
        [secondPlayerSession, "Bob"],
      ] as const) {
        const claim = await playerSession.post(
          `/api/v1/games/${gameId}/players`,
          { data: { name } }
        )
        expect(claim.status()).toBe(201)
        const assignment = await playerSession.post(
          `/api/v1/games/${gameId}/teams/${teamId}/players`
        )
        expect(assignment.status()).toBe(200)
        const ready = await playerSession.post(
          `/api/v1/games/${gameId}/players/ready`
        )
        expect(ready.status()).toBe(200)
      }
    })

    const revisionBeforeDelete = (await readGame(session, gameId)).revision
    const deletion = await test.step("Delete the team", () =>
      session.delete(`/api/v1/games/${gameId}/teams/${teamId}`))

    await test.step("Assert the team deletion and player state", async () => {
      expect(deletion.status()).toBe(200)
      const game = await readGame(session, gameId)
      expect(game).toMatchObject({
        revision: revisionBeforeDelete + 1,
        teams: [],
      })
      expect(game.unassignedPlayers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Alice", ready: false }),
          expect.objectContaining({ name: "Bob", ready: false }),
        ])
      )

      const retrySession = await createPlayerApiContext(playwright, session)
      additionalSessions.push(retrySession)
      const duplicateClaim = await retrySession.post(
        `/api/v1/games/${gameId}/players`,
        { data: { name: "Alice" } }
      )
      expect(duplicateClaim.status()).toBe(409)
      expect(await duplicateClaim.json()).toMatchObject({
        error: ApiErrorCode.NAME_NOT_AVAILABLE,
      })
    })
  })
})
