import {
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test"
import { createApiContext, type PlaywrightTestHost } from "@/e2e/resources/api"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"

export async function createGame(
  context: APIRequestContext,
  game = TEST_FIXTURES.game
) {
  const response = await context.post("/api/v1/games", {
    data: game,
  })
  expect(response.status()).toBe(201)
  return response.json() as Promise<{ gameId: string }>
}

export async function readGame(context: APIRequestContext, gameId: string) {
  const response = await context.get(`/api/v1/games/${gameId}`)
  expect(response.status()).toBe(200)
  return response.json()
}

export async function captureGameMutation(
  context: APIRequestContext,
  gameId: string,
  response: APIResponse
) {
  return {
    responseStatus: response.status(),
    responseBody: await response.json(),
    gameState: await readGame(context, gameId),
  }
}

export async function createGameSession(
  playwright: PlaywrightTestHost,
  game = TEST_FIXTURES.game
) {
  const session = await createApiContext(playwright)
  const { gameId } = await createGame(session, game)
  const joinResponse = await session.post(`/api/v1/games/${gameId}/join`, {
    data: { password: TEST_FIXTURES.game.password },
  })
  expect(joinResponse.status()).toBe(200)
  return { gameId, session }
}
