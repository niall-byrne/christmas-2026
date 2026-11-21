import "server-only"
import type { ApiEndpointInput } from "@/contracts/game/api"
import { GAME_LOBBY_LEVEL } from "@/contracts/game/api/data"
import { Authorization } from "@/game/api/auth"
import { ApiEndpointBase } from "@/game/api/endpoints/bases/apiEndpointBase"
import { serializeCardEntry } from "@/game/api/services/card"
import { gameIds } from "@/game/api/services/ids"
import { gameAuthRateLimiter } from "@/game/api/services/joinRateLimit"
import { gamePasswords } from "@/game/api/services/password"
import { redisKeys } from "@/game/api/redis/redisKeys"
import { createGameScript } from "@/game/api/redis/scripts/createGame"
import { redisLookupKey } from "@/game/api/redis/redisLookupKey"
import { RedisClient } from "@/redis/api/client"
import { z } from "zod"
import { CreateGameBodySchema } from "@/schemas/game/api/game"

class CreateGameEndpoint extends ApiEndpointBase<
  z.ZodType,
  typeof CreateGameBodySchema
> {
  protected override bodySchema = CreateGameBodySchema
  protected override requiresAuth = false

  protected async execute({
    body,
    request,
  }: ApiEndpointInput<unknown, z.output<typeof CreateGameBodySchema>>) {
    await gameAuthRateLimiter.enforce(request)

    const gameId = gameIds.createGameId()
    const salt = gamePasswords.createSalt()
    const client = RedisClient.getClient()
    const gameKey = redisKeys.game(gameId)
    const cardsKey = redisKeys.cards(gameId)

    const cardsLookup = Object.fromEntries(
      body.cards.map(({ recipient, identifier }) => [
        redisLookupKey(recipient),
        serializeCardEntry(recipient, identifier),
      ])
    )

    const gameHash = {
      level: String(GAME_LOBBY_LEVEL),
      revision: "1",
      created_at: new Date().toISOString(),
      name: body.name,
      password_hash: await gamePasswords.hash(body.password, salt),
      bonus_card: body.bonusCard,
    }

    const result: unknown = await client.eval(
      createGameScript,
      2,
      gameKey,
      cardsKey,
      JSON.stringify(gameHash),
      JSON.stringify(cardsLookup)
    )
    if (result !== "OK") {
      throw new Error("Create-game script returned an unexpected result")
    }

    return {
      status: 201,
      data: {
        gameId,
        name: body.name,
        level: GAME_LOBBY_LEVEL,
      },
      headers: {
        "Set-Cookie": Authorization.responseHeaderFactory(gameId),
      },
    }
  }
}

export const POST = new CreateGameEndpoint().handle
