import "server-only"
import type { ApiEndpointInput } from "@/contracts/api"
import { Authorization } from "@/lib/api/auth"
import { ApiEndpoint } from "@/lib/api/endpoint"
import { serializeCardEntry } from "@/lib/game/card"
import { gameIds } from "@/lib/game/ids"
import { gamePasswords } from "@/lib/game/password"
import { redisKeys } from "@/lib/game/redisKeys"
import { redisLookupKey } from "@/lib/game/redisLookupKey"
import { RedisClient } from "@/lib/redis/client"
import { z } from "zod"
import { GAME_LOBBY_LEVEL } from "@/contracts/gameData/game"
import { CreateGameBodySchema } from "@/schemas/gameData/game"

class CreateGameEndpoint extends ApiEndpoint<
  z.ZodType,
  typeof CreateGameBodySchema
> {
  protected override bodySchema = CreateGameBodySchema
  protected override requiresAuth = false

  protected async execute({
    body,
  }: ApiEndpointInput<unknown, z.output<typeof CreateGameBodySchema>>) {
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

    await client.hset(gameKey, {
      level: String(GAME_LOBBY_LEVEL),
      revision: "1",
      created_at: new Date().toISOString(),
      name: body.name,
      password_hash: gamePasswords.hash(body.password, salt),
      bonus_card: body.bonusCard,
    })

    if (Object.keys(cardsLookup).length > 0) {
      await client.hset(cardsKey, cardsLookup)
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
