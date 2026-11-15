import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { GAME_LOBBY_LEVEL } from "@/contracts/gameData"
import { Authorization } from "@/lib/api/auth"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { serializeCardEntry } from "@/lib/game/card"
import { gameIds } from "@/lib/game/ids"
import { gameAuthRateLimiter } from "@/lib/game/joinRateLimit"
import { gamePasswords } from "@/lib/game/password"
import { redisKeys } from "@/lib/game/redisKeys"
import { createGameScript } from "@/lib/game/redisScripts/createGame"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { RedisClient } from "@/lib/redis/client"
import { z } from "zod"
import { CreateGameBodySchema } from "@/schemas/gameData/game"

class CreateGameEndpoint extends ApiEndpoint<
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
