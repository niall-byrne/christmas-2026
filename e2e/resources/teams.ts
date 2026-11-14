import { expect, type APIRequestContext } from "@playwright/test"
import { TEST_FIXTURES } from "@/e2e/resources/fixtures"

export async function createTeam(context: APIRequestContext, gameId: string) {
  const response = await context.post(`/api/v1/games/${gameId}/teams`, {
    data: TEST_FIXTURES.team,
  })
  expect(response.status()).toBe(201)
  return response.json() as Promise<{ teamId: string }>
}
