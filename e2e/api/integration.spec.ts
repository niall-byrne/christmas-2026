import { expect, test } from "@/e2e/resources/test"
import type { APIRequestContext } from "@playwright/test"
import { createApiContext } from "@/e2e/resources/api"
import { createGame, readGame } from "@/e2e/resources/games"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"

test.describe("Full game lifecycle", () => {
  let scenario: {
    creator: APIRequestContext
    session: APIRequestContext
  }

  test.beforeEach(async ({ playwright }) => {
    scenario = {
      creator: await createApiContext(playwright),
      session: await createApiContext(playwright),
    }
  })

  test.afterEach(async () => {
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
      await test.step("Add a player and verify the saved state", async () => {
        const response = await session.post(
          `/api/v1/games/${gameId}/teams/${teamId}/players`,
          { data: TEST_FIXTURES.player }
        )
        expect(response.status()).toBe(201)
        const player = (await response.json()) as { playerId: string }
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
        `/api/v1/games/${gameId}/teams/${teamId}/players/${playerId}/ready`
      )
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        teams: [{ teamId, players: [{ playerId, ready: true }] }],
      })
    })

    await test.step("Mark the player not ready and verify the saved state", async () => {
      const response = await session.delete(
        `/api/v1/games/${gameId}/teams/${teamId}/players/${playerId}/ready`
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

    await test.step("Remove the player and verify the saved state", async () => {
      const response = await session.delete(
        `/api/v1/games/${gameId}/teams/${teamId}/players/${playerId}`
      )
      expect(response.status()).toBe(200)
      await expect(readGame(session, gameId)).resolves.toMatchObject({
        gameId,
        name: "Integrated Playwright game",
        teams: [{ teamId, score: 7, players: [] }],
      })
    })
  })
})
