import { expect, type APIRequestContext } from "@playwright/test"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"

export async function addPlayer(
  context: APIRequestContext,
  gameId: string,
  teamId: string
) {
  const response = await context.post(
    `/api/v1/games/${gameId}/teams/${teamId}/players`,
    { data: TEST_FIXTURES.player }
  )
  expect(response.status()).toBe(201)
  return response.json() as Promise<{ playerId: string }>
}
